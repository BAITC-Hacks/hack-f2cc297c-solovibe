import "server-only";
import { Composio, type ToolRouterSession } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

let client: Composio<VercelProvider> | undefined;

function boundedSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(60_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function getComposio() {
  if (!process.env.COMPOSIO_API_KEY) throw new Error("COMPOSIO_API_KEY is not configured");
  return client ??= new Composio({ provider: new VercelProvider() });
}

/** Pass Better Auth's authenticated session.user.id, never an identity from request input. */
export async function getComposioSession(userId: string, sessionId?: string, signal?: AbortSignal) {
  if (!userId.trim()) throw new Error("An authenticated user ID is required");
  const composio = getComposio();
  const options = { signal: boundedSignal(signal) };
  if (!sessionId) return composio.sessions.create(userId, undefined, options);

  // The project key can retrieve every user's session; check ownership before exposing tools.
  const saved = await composio.getClient().toolRouter.session.retrieve(sessionId, options);
  if (saved.config.user_id !== userId) throw new Error("Composio session not found for this user");
  return composio.sessions.use(sessionId, undefined, options);
}

/** Persist sessionId with the future conversation/run and provide it on subsequent turns. */
export async function getComposioTools(userId: string, sessionId?: string, signal?: AbortSignal) {
  // SDK 0.18.1 returns this class, but its Session interface omits request options.
  const session = await getComposioSession(userId, sessionId, signal) as ToolRouterSession<
    ReturnType<VercelProvider["wrapTools"]>, ReturnType<VercelProvider["wrapTool"]>, VercelProvider
  >;
  const tools = await session.tools(undefined, { signal: boundedSignal(signal) });
  // The provider's default execute callback does not forward AI SDK cancellation.
  for (const [slug, tool] of Object.entries(tools)) {
    tool.execute = (input, context) => session.execute(slug, input, undefined, {
      signal: boundedSignal(context.abortSignal ?? signal),
    });
  }
  return { sessionId: session.sessionId, tools };
}
