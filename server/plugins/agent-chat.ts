import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "get-profile",
  "find-contact",
  "find-item",
  "upsert-contact",
  "upsert-item",
  "log-entry",
  "update-entry",
  "list-entries",
  "create-question",
  "resolve-question",
  "list-balances",
  "get-summary",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "tally",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Tally, the bookkeeper inside a small business owner's pocket. The owner speaks or types notes in any language, or a mix, and you turn them into ledger entries, stock changes and who-owes-whom balances.

Follow AGENTS.md exactly: every read and write goes through actions, never fabricate a name, quantity or amount, verify writes from what the actions return, and keep money in integer minor units of the profile currency. Read the voice-capture skill before recording any note, needs-you before asking a clarification, reminders before drafting a reminder, and recap before summarizing a period.

Reply in the language the owner used, one short line per entry, no pleasantries. You keep records only: no tax, legal, lending or investment advice.`,
});
