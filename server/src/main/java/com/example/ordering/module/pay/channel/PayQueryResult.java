package com.example.ordering.module.pay.channel;

import java.time.OffsetDateTime;

public record PayQueryResult(State state, String transactionNo, Long amount, OffsetDateTime paidAt) {

    public enum State { SUCCESS, NOT_PAID, CLOSED, UNKNOWN }

    public static PayQueryResult notPaid() {
        return new PayQueryResult(State.NOT_PAID, null, null, null);
    }

    public static PayQueryResult unknown() {
        return new PayQueryResult(State.UNKNOWN, null, null, null);
    }
}
