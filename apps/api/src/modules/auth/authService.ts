import { hashPassword, signSession, verifyPassword } from "@agentready/auth";
import { HttpError } from "../../lib/httpError.js";
import { AuditService } from "../audit/auditService.js";
import { AuthRepository } from "./authRepository.js";

import type { SystemRole } from "./rbac.js";
import type { ApiKeyScope } from "./scopes.js";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type UserAuthContext = {
  actorType: "USER";
  organizationId: string;
  userId: string;
  role: SystemRole;
  agentId?: never;
  scopes?: never;
};

export type AgentAuthContext = {
  actorType: "AGENT";
  organizationId: string;
  agentId: string;
  scopes: ApiKeyScope[];
  userId?: never;
  role?: never;
};

export type AuthContext = UserAuthContext | AgentAuthContext;

export class AuthService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly sessionSecret: string,
    private readonly secureCookies: boolean,
    private readonly audit: AuditService
  ) {}

  async register(input: {
    email: string;
    password: string;
    name?: string;
    organizationName: string;
  }) {
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.auth.createUserWithOrganization({
        email: input.email,
        name: input.name,
        passwordHash,
        organizationName: input.organizationName,
        organizationSlug: this.slugify(input.organizationName)
      });

      const session = this.createSessionResponse(user);
      await this.audit.record({
        organizationId: session.body.organization.id,
        source: "HUMAN",
        actorUserId: session.body.user.id,
        action: "auth.registered",
        resourceType: "User",
        resourceId: session.body.user.id,
        after: {
          user: session.body.user,
          organization: session.body.organization,
          role: session.body.role
        }
      });

      return session;
    } catch (error) {
      if (this.auth.isUniqueConstraintError(error)) {
        throw new HttpError({
          code: "CONFLICT",
          message: "Email or organization slug already exists",
          statusCode: 409
        });
      }

      throw error;
    }
  }

  async login(input: { email: string; password: string }) {
    const user = await this.auth.findUserByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
        statusCode: 401
      });
    }

    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
        statusCode: 401
      });
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "No organization membership found for this user",
        statusCode: 401
      });
    }

    const session = this.createSessionResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      memberships: [membership]
    });

    await this.audit.record({
      organizationId: membership.organizationId,
      source: "HUMAN",
      actorUserId: user.id,
      action: "auth.logged_in",
      resourceType: "User",
      resourceId: user.id
    });

    return session;
  }

  async currentUser(context: AuthContext) {
    if (context.actorType !== "USER" || !context.userId) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "Session is no longer valid",
        statusCode: 401
      });
    }

    const user = await this.auth.findUserContext({
      userId: context.userId,
      organizationId: context.organizationId
    });
    const membership = user?.memberships[0];
    if (!user || !membership) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "Session is no longer valid",
        statusCode: 401
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      organization: membership.organization,
      role: membership.role
    };
  }

  createLogoutCookie() {
    return this.serializeCookie("", 0);
  }

  async logout(context: AuthContext | null) {
    if (context && context.actorType === "USER") {
      await this.audit.record({
        organizationId: context.organizationId,
        source: "HUMAN",
        actorUserId: context.userId,
        action: "auth.logged_out",
        resourceType: "User",
        resourceId: context.userId
      });
    }

    return this.createLogoutCookie();
  }

  private createSessionResponse(user: {
    id: string;
    email: string;
    name: string | null;
    memberships: Array<{
      role: string;
      organization: { id: string; name: string; slug: string };
    }>;
  }) {
    const membership = user.memberships[0];
    if (!membership) {
      throw new HttpError({
        code: "VALIDATION_ERROR",
        message: "User must belong to an organization",
        statusCode: 400
      });
    }

    const token = signSession(
      {
        userId: user.id,
        organizationId: membership.organization.id,
        exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
      },
      this.sessionSecret
    );

    return {
      cookie: this.serializeCookie(token, sessionMaxAgeSeconds),
      body: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        organization: membership.organization,
        role: membership.role
      }
    };
  }

  private serializeCookie(value: string, maxAgeSeconds: number) {
    const parts = [
      `agentready_session=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAgeSeconds}`
    ];

    if (this.secureCookies) {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  private slugify(value: string) {
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || `org-${Date.now()}`;
  }
}
