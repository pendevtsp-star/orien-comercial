export type CommercialDocumentType = 'quote' | 'order' | 'dav';

export type CommercialDocumentStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'reserved'
  | 'converted'
  | 'expired'
  | 'cancelled';

export type ReservationAction = 'none' | 'release' | 'consume';

type TransitionMap = Readonly<
  Record<CommercialDocumentStatus, readonly CommercialDocumentStatus[]>
>;

const TERMINAL_STATUSES = new Set<CommercialDocumentStatus>([
  'converted',
  'expired',
  'cancelled',
]);

const TERMINAL_TRANSITIONS = {
  converted: [],
  expired: [],
  cancelled: [],
} as const;

const TRANSITIONS: Readonly<Record<CommercialDocumentType, TransitionMap>> = {
  quote: {
    draft: ['sent', 'cancelled'],
    sent: ['approved', 'expired', 'cancelled'],
    approved: ['reserved', 'converted', 'expired', 'cancelled'],
    reserved: ['converted', 'expired', 'cancelled'],
    ...TERMINAL_TRANSITIONS,
  },
  order: {
    draft: ['sent', 'approved', 'cancelled'],
    sent: ['approved', 'expired', 'cancelled'],
    approved: ['reserved', 'converted', 'expired', 'cancelled'],
    reserved: ['converted', 'expired', 'cancelled'],
    ...TERMINAL_TRANSITIONS,
  },
  dav: {
    draft: ['approved', 'cancelled'],
    sent: [],
    approved: ['reserved', 'converted', 'expired', 'cancelled'],
    reserved: ['converted', 'expired', 'cancelled'],
    ...TERMINAL_TRANSITIONS,
  },
};

export class CommercialDocumentTransitionError extends Error {
  constructor(
    readonly documentType: CommercialDocumentType,
    readonly currentStatus: CommercialDocumentStatus,
    readonly nextStatus: CommercialDocumentStatus,
  ) {
    super(
      `Transicao invalida para ${documentType}: ${currentStatus} -> ${nextStatus}`,
    );
    this.name = 'CommercialDocumentTransitionError';
  }
}

export function isTerminalCommercialDocumentStatus(
  status: CommercialDocumentStatus,
): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function getAllowedCommercialDocumentTransitions(
  type: CommercialDocumentType,
  currentStatus: CommercialDocumentStatus,
): CommercialDocumentStatus[] {
  return [...TRANSITIONS[type][currentStatus]];
}

export type CommercialDocumentTransitionInput = {
  type: CommercialDocumentType;
  currentStatus: CommercialDocumentStatus;
  nextStatus: CommercialDocumentStatus;
  cancellationReason?: string;
};

export type CommercialDocumentTransition = {
  type: CommercialDocumentType;
  previousStatus: CommercialDocumentStatus;
  status: CommercialDocumentStatus;
  cancellationReason?: string;
};

export function assertCommercialDocumentTransition(
  input: CommercialDocumentTransitionInput,
): CommercialDocumentTransition {
  const allowed = TRANSITIONS[input.type][input.currentStatus];

  if (!allowed.includes(input.nextStatus)) {
    throw new CommercialDocumentTransitionError(
      input.type,
      input.currentStatus,
      input.nextStatus,
    );
  }

  if (input.nextStatus === 'cancelled') {
    const cancellationReason = input.cancellationReason?.trim();
    if (!cancellationReason) {
      throw new Error('Motivo de cancelamento obrigatorio');
    }

    return {
      type: input.type,
      previousStatus: input.currentStatus,
      status: input.nextStatus,
      cancellationReason,
    };
  }

  return {
    type: input.type,
    previousStatus: input.currentStatus,
    status: input.nextStatus,
  };
}

export function decideReservationAction(input: {
  currentStatus: CommercialDocumentStatus;
  nextStatus: CommercialDocumentStatus;
  hasActiveReservation: boolean;
}): ReservationAction {
  if (!input.hasActiveReservation) return 'none';
  if (input.nextStatus === 'converted') return 'consume';
  if (input.nextStatus === 'cancelled' || input.nextStatus === 'expired') return 'release';
  return 'none';
}
