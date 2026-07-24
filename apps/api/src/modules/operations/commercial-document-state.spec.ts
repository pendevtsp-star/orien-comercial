import { describe, expect, it } from 'vitest';

import {
  CommercialDocumentTransitionError,
  assertCommercialDocumentTransition,
  decideReservationAction,
  getAllowedCommercialDocumentTransitions,
  isTerminalCommercialDocumentStatus,
  type CommercialDocumentStatus,
  type CommercialDocumentType,
} from './commercial-document-state';

const terminalStatuses: CommercialDocumentStatus[] = ['converted', 'expired', 'cancelled'];

describe('commercial document state machine', () => {
  it.each<
    [CommercialDocumentType, CommercialDocumentStatus, CommercialDocumentStatus[]]
  >([
    ['quote', 'draft', ['sent', 'cancelled']],
    ['quote', 'sent', ['approved', 'expired', 'cancelled']],
    ['quote', 'approved', ['reserved', 'converted', 'expired', 'cancelled']],
    ['quote', 'reserved', ['converted', 'expired', 'cancelled']],
    ['order', 'draft', ['sent', 'approved', 'cancelled']],
    ['order', 'sent', ['approved', 'expired', 'cancelled']],
    ['order', 'approved', ['reserved', 'converted', 'expired', 'cancelled']],
    ['order', 'reserved', ['converted', 'expired', 'cancelled']],
    ['dav', 'draft', ['approved', 'cancelled']],
    ['dav', 'approved', ['reserved', 'converted', 'expired', 'cancelled']],
    ['dav', 'reserved', ['converted', 'expired', 'cancelled']],
  ])('explicita as transicoes de %s em %s', (type, currentStatus, expected) => {
    expect(getAllowedCommercialDocumentTransitions(type, currentStatus)).toEqual(expected);
  });

  it.each<
    [CommercialDocumentType, CommercialDocumentStatus, CommercialDocumentStatus]
  >([
    ['quote', 'draft', 'sent'],
    ['quote', 'sent', 'approved'],
    ['quote', 'approved', 'reserved'],
    ['quote', 'reserved', 'converted'],
    ['order', 'draft', 'approved'],
    ['order', 'approved', 'converted'],
    ['dav', 'draft', 'approved'],
    ['dav', 'approved', 'converted'],
  ])('aceita a transicao %s de %s para %s', (type, currentStatus, nextStatus) => {
    expect(
      assertCommercialDocumentTransition({ type, currentStatus, nextStatus }),
    ).toEqual({ type, previousStatus: currentStatus, status: nextStatus });
  });

  it.each<
    [CommercialDocumentType, CommercialDocumentStatus, CommercialDocumentStatus]
  >([
    ['quote', 'draft', 'converted'],
    ['quote', 'sent', 'reserved'],
    ['order', 'draft', 'reserved'],
    ['dav', 'draft', 'sent'],
    ['dav', 'approved', 'sent'],
  ])('rejeita a transicao %s de %s para %s', (type, currentStatus, nextStatus) => {
    expect(() =>
      assertCommercialDocumentTransition({ type, currentStatus, nextStatus }),
    ).toThrow(CommercialDocumentTransitionError);
  });

  it.each(terminalStatuses)('considera %s um estado terminal', (status) => {
    expect(isTerminalCommercialDocumentStatus(status)).toBe(true);
  });

  it.each(['draft', 'sent', 'approved', 'reserved'] as const)(
    'nao considera %s um estado terminal',
    (status) => {
      expect(isTerminalCommercialDocumentStatus(status)).toBe(false);
    },
  );

  it.each<CommercialDocumentType>(['quote', 'order', 'dav'])(
    'impede qualquer transicao depois de um estado terminal para %s',
    (type) => {
      for (const currentStatus of terminalStatuses) {
        expect(getAllowedCommercialDocumentTransitions(type, currentStatus)).toEqual([]);
        expect(() =>
          assertCommercialDocumentTransition({
            type,
            currentStatus,
            nextStatus: 'draft',
          }),
        ).toThrow(CommercialDocumentTransitionError);
      }
    },
  );

  it.each(['', '   ', undefined])(
    'exige motivo nao vazio ao cancelar (%s)',
    (cancellationReason) => {
      expect(() =>
        assertCommercialDocumentTransition({
          type: 'quote',
          currentStatus: 'draft',
          nextStatus: 'cancelled',
          cancellationReason,
        }),
      ).toThrow('Motivo de cancelamento obrigatorio');
    },
  );

  it('normaliza o motivo ao aceitar o cancelamento', () => {
    expect(
      assertCommercialDocumentTransition({
        type: 'order',
        currentStatus: 'approved',
        nextStatus: 'cancelled',
        cancellationReason: '  Cliente desistiu  ',
      }),
    ).toEqual({
      type: 'order',
      previousStatus: 'approved',
      status: 'cancelled',
      cancellationReason: 'Cliente desistiu',
    });
  });
});

describe('reservation action', () => {
  it('consome a reserva ativa quando o documento e convertido', () => {
    expect(
      decideReservationAction({
        currentStatus: 'reserved',
        nextStatus: 'converted',
        hasActiveReservation: true,
      }),
    ).toBe('consume');
  });

  it.each(['cancelled', 'expired'] as const)(
    'libera a reserva ativa quando o documento termina como %s',
    (nextStatus) => {
      expect(
        decideReservationAction({
          currentStatus: 'reserved',
          nextStatus,
          hasActiveReservation: true,
        }),
      ).toBe('release');
    },
  );

  it('nao cria efeito de reserva quando nao existe reserva ativa', () => {
    expect(
      decideReservationAction({
        currentStatus: 'approved',
        nextStatus: 'converted',
        hasActiveReservation: false,
      }),
    ).toBe('none');
  });

  it('nao altera reserva ativa em uma transicao nao terminal', () => {
    expect(
      decideReservationAction({
        currentStatus: 'approved',
        nextStatus: 'reserved',
        hasActiveReservation: true,
      }),
    ).toBe('none');
  });
});
