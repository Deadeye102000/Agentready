import type { Prisma, PrismaClient } from "@agentready/db";

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, slug: true } }
          },
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });
  }

  findUserContext(input: { userId: string; organizationId: string }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.userId,
        memberships: {
          some: { organizationId: input.organizationId }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: {
          where: { organizationId: input.organizationId },
          include: {
            organization: { select: { id: true, name: true, slug: true } }
          },
          take: 1
        }
      }
    });
  }

  createUserWithOrganization(input: {
    email: string;
    name?: string;
    passwordHash: string;
    organizationName: string;
    organizationSlug: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        memberships: {
          create: {
            role: "OWNER",
            organization: {
              create: {
                name: input.organizationName,
                slug: input.organizationSlug
              }
            }
          }
        }
      },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, slug: true } }
          },
          take: 1
        }
      }
    });
  }

  updateUserPassword(input: { userId: string; passwordHash: string }) {
    return this.prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: input.passwordHash }
    });
  }

  isUniqueConstraintError(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as Prisma.PrismaClientKnownRequestError).code === "P2002"
    );
  }
}
