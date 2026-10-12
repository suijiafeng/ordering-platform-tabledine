package com.example.ordering.menu;

import com.example.ordering.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

class DailyStockMigrationIntegrationTest extends AbstractIntegrationTest {

    @Test
    void migrationRecoversOccupiedCountIncludingUnlimitedAndCookedCancelledOrders() throws Exception {
        // Temporary tables isolate the real migration SQL from the shared application schema.
        try (Connection connection = Objects.requireNonNull(jdbc.getDataSource()).getConnection()) {
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.execute("CREATE TEMP TABLE dish (id BIGINT PRIMARY KEY, daily_stock INT, stock_quantity INT, stock_date DATE) ON COMMIT DROP");
                statement.execute("CREATE TEMP TABLE orders (id BIGINT PRIMARY KEY, status VARCHAR(16), created_at TIMESTAMPTZ, "
                        + "cooking_started_at TIMESTAMPTZ, ready_at TIMESTAMPTZ) ON COMMIT DROP");
                statement.execute("CREATE TEMP TABLE order_item (dish_id BIGINT, order_id BIGINT, quantity INT) ON COMMIT DROP");
                statement.execute("INSERT INTO dish VALUES "
                        + "(1, 5, 0, (now() AT TIME ZONE 'Asia/Shanghai')::date), "
                        + "(2, NULL, NULL, NULL), "
                        + "(3, 10, 0, (now() AT TIME ZONE 'Asia/Shanghai')::date - 1), "
                        + "(4, 10, 3, (now() AT TIME ZONE 'Asia/Shanghai')::date)");
                statement.execute("INSERT INTO orders VALUES "
                        + "(1, 'PENDING_PAY', now(), NULL, NULL), "
                        + "(2, 'CANCELLED', now(), now(), NULL), "
                        + "(3, 'CANCELLED', now(), NULL, now()), "
                        + "(4, 'CANCELLED', now(), NULL, NULL), "
                        + "(5, 'CLOSED', now(), NULL, NULL), "
                        + "(6, 'DONE', now() - interval '1 day', now(), now())");
                statement.execute("INSERT INTO order_item VALUES (1, 1, 8), (2, 1, 2), (2, 2, 3), "
                        + "(2, 3, 4), (2, 4, 5), (2, 5, 6), (3, 6, 10)");
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V17__preserve_daily_stock_occupied.sql"));
                assertMigrationRow(statement, 1, 8, 0);
                assertMigrationRow(statement, 2, 9, null);
                assertMigrationRow(statement, 3, 0, 10);
                // Existing same-day counter is a conservative lower bound if historical order metadata is missing.
                assertMigrationRow(statement, 4, 7, 3);
            } finally {
                connection.rollback();
            }
        }
    }

    private void assertMigrationRow(Statement statement, long dishId, long occupied, Integer remaining) throws Exception {
        try (ResultSet row = statement.executeQuery("SELECT stock_occupied, stock_quantity, "
                + "stock_date = (now() AT TIME ZONE 'Asia/Shanghai')::date AS today FROM dish WHERE id = " + dishId)) {
            assertThat(row.next()).isTrue();
            assertThat(row.getLong("stock_occupied")).isEqualTo(occupied);
            assertThat(row.getObject("stock_quantity", Integer.class)).isEqualTo(remaining);
            assertThat(row.getBoolean("today")).isTrue();
        }
    }
}
