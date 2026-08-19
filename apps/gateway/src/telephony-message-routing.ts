export const DEFAULT_CENTREX_MESSAGE_SENDER_LINE = "07046070588";

export type TelephonyMessageDeliveryRoute = {
  endpointId: string;
  senderNumberSnapshot: string;
  replyMailboxEndpointId: string | null;
};

export function centrexMessageDeliveryRoute(endpoint: {
  id: string;
  lineNumber: string;
}): TelephonyMessageDeliveryRoute {
  return {
    endpointId: endpoint.id,
    senderNumberSnapshot: endpoint.lineNumber,
    replyMailboxEndpointId: endpoint.id,
  };
}

export function solapiMessageDeliveryRoute(input: {
  actorEndpointId: string;
  senderNumber: string;
  replyMailboxEndpointId: string | null;
}): TelephonyMessageDeliveryRoute {
  return {
    endpointId: input.actorEndpointId,
    senderNumberSnapshot: input.senderNumber,
    replyMailboxEndpointId: input.replyMailboxEndpointId,
  };
}

export type OutboundReplyMatchStrategy = "reply_mailbox_latest_outbound";

export function outboundReplyMatchStrategy(
  outboundReplyMailboxEndpointId: string | null,
  inboundMailboxEndpointId: string,
): OutboundReplyMatchStrategy | null {
  if (outboundReplyMailboxEndpointId === inboundMailboxEndpointId) {
    return "reply_mailbox_latest_outbound";
  }
  return null;
}
