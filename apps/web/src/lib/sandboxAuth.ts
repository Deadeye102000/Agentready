export const DEV_DEFAULT_SANDBOX_AGENT_API_KEY = "ar_dev_demo_agent_key_change_me";

export const getApiKey = (): string => {
  const isDefaultOrUnset =
    !process.env.SANDBOX_AGENT_API_KEY ||
    process.env.SANDBOX_AGENT_API_KEY === DEV_DEFAULT_SANDBOX_AGENT_API_KEY;

  if (isDefaultOrUnset && process.env.ALLOW_INSECURE_DEV_SECRETS !== "true") {
    throw new Error(
      "SANDBOX_AGENT_API_KEY is required and must not use the development default unless ALLOW_INSECURE_DEV_SECRETS=true is explicitly configured"
    );
  }
  return process.env.SANDBOX_AGENT_API_KEY || DEV_DEFAULT_SANDBOX_AGENT_API_KEY;
};
