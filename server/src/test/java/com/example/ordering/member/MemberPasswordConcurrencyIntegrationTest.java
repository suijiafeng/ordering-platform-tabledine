package com.example.ordering.member;

import com.example.ordering.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MemberPasswordConcurrencyIntegrationTest extends AbstractIntegrationTest {

    @SpyBean
    private PasswordEncoder passwordEncoder;

    @Test
    void concurrentOwnerResetsRevokeTheSessionIssuedBetweenTheirUpdates() throws Exception {
        String owner = ownerToken();
        String phone = randomPhone();
        long memberId = createMember(owner, phone);
        String original = memberLogin(phone, MEMBER_PASSWORD);
        CountDownLatch secondReadOldVersion = new CountDownLatch(1);
        CountDownLatch finishSecond = new CountDownLatch(1);
        pauseEncoding("final-pass", secondReadOldVersion, finishSecond);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> second = executor.submit(() -> {
                reset(owner, memberId, "final-pass");
                return null;
            });
            assertThat(secondReadOldVersion.await(10, TimeUnit.SECONDS)).isTrue();
            reset(owner, memberId, "interim-pass");
            String intermediate = memberLogin(phone, "interim-pass");
            mvc.perform(authed(get("/api/v1/c/me"), intermediate)).andExpect(status().isOk());
            finishSecond.countDown();
            second.get(10, TimeUnit.SECONDS);
            assertRevokedAndLatestWorks(memberId, phone, original, intermediate);
        } finally {
            finishSecond.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentOwnPasswordChangesAlsoRevokeTheIntermediateSession() throws Exception {
        String owner = ownerToken();
        String phone = randomPhone();
        long memberId = createMember(owner, phone);
        String original = memberLogin(phone, MEMBER_PASSWORD);
        CountDownLatch secondReadOldVersion = new CountDownLatch(1);
        CountDownLatch finishSecond = new CountDownLatch(1);
        pauseEncoding("final-pass", secondReadOldVersion, finishSecond);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> second = executor.submit(() -> {
                changeOwnPassword(original, "final-pass");
                return null;
            });
            assertThat(secondReadOldVersion.await(10, TimeUnit.SECONDS)).isTrue();
            changeOwnPassword(original, "interim-pass");
            String intermediate = memberLogin(phone, "interim-pass");
            mvc.perform(authed(get("/api/v1/c/me"), intermediate)).andExpect(status().isOk());
            finishSecond.countDown();
            second.get(10, TimeUnit.SECONDS);
            assertRevokedAndLatestWorks(memberId, phone, original, intermediate);
        } finally {
            finishSecond.countDown();
            executor.shutdownNow();
        }
    }

    private void pauseEncoding(String password, CountDownLatch readCompleted, CountDownLatch proceed) {
        doAnswer(invocation -> {
            // Both requests have already read token_version before hashing. Hold the later UPDATE until a login occurs.
            readCompleted.countDown();
            assertThat(proceed.await(10, TimeUnit.SECONDS)).isTrue();
            return invocation.callRealMethod();
        }).when(passwordEncoder).encode(password);
    }

    private void assertRevokedAndLatestWorks(long memberId, String phone, String original, String intermediate) throws Exception {
        assertThat(jdbc.queryForObject("SELECT token_version FROM customer WHERE id = ?", Integer.class, memberId)).isEqualTo(2);
        mvc.perform(authed(get("/api/v1/c/me"), original)).andExpect(status().isUnauthorized());
        mvc.perform(authed(get("/api/v1/c/me"), intermediate)).andExpect(status().isUnauthorized());
        mvc.perform(authed(get("/api/v1/c/me"), memberLogin(phone, "final-pass"))).andExpect(status().isOk());
    }

    private long createMember(String owner, String phone) throws Exception {
        return data(mvc.perform(authed(post("/api/v1/m/members"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "name", "并发改密", "password", MEMBER_PASSWORD)))
                .andExpect(status().isOk()).andReturn()).path("id").asLong();
    }

    private void reset(String owner, long memberId, String password) throws Exception {
        mvc.perform(authed(put("/api/v1/m/members/" + memberId), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("password", password, "operatorPassword", "admin123")))
                .andExpect(status().isOk());
    }

    private void changeOwnPassword(String token, String password) throws Exception {
        mvc.perform(authed(put("/api/v1/c/me/password"), token).contentType(MediaType.APPLICATION_JSON)
                        .content(json("oldPassword", MEMBER_PASSWORD, "newPassword", password)))
                .andExpect(status().isOk());
    }

    private static String randomPhone() {
        return "138" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
    }
}
