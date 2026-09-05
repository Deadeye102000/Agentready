export const DEV_DEFAULT_SANDBOX_AGENT_API_KEY = "ar_dev_demo_agent_key_change_me";

export const getApiKey = (): string => {
  if (process.env.NODE_ENV === "production") {
    if (
      !process.env.SANDBOX_AGENT_API_KEY ||
      process.env.SANDBOX_AGENT_API_KEY === DEV_DEFAULT_SANDBOX_AGENT_API_KEY
    ) {
      throw new Error(
        "SANDBOX_AGENT_API_KEY is required in production and must not use the development default"
      );
    }
  }
  return process.env.SANDBOX_AGENT_API_KEY || DEV_DEFAULT_SANDBOX_AGENT_API_KEY;
};
