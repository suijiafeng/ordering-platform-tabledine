package com.example.ordering.module.pay.channel;

public record RefundResult(State state, String channelRefundNo, String failReason) {

    public enum State { PROCESSING, SUCCESS, FAILED, UNKNOWN }

    public static RefundResult processing(String channelRefundNo) {
        return new RefundResult(State.PROCESSING, channelRefundNo, null);
    }

    public static RefundResult success(String channelRefundNo) {
        return new RefundResult(State.SUCCESS, channelRefundNo, null);
    }

    public static RefundResult failed(String reason) {
        return new RefundResult(State.FAILED, null, reason);
    }

    public static RefundResult unknown() {
        return new RefundResult(State.UNKNOWN, null, null);
    }
}
