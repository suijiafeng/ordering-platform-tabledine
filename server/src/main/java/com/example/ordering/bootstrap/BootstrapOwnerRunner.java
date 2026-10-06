package com.example.ordering.bootstrap;

import com.example.ordering.config.AppProperties;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.mapper.StoreMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 生产环境首次部署：库中没有任何门店时，按配置创建门店和店主账号。
 * 通过环境变量 BOOTSTRAP_ENABLED / BOOTSTRAP_STORE_NAME / BOOTSTRAP_OWNER_USERNAME / BOOTSTRAP_OWNER_PASSWORD 启用。
 * 创建成功后建议关闭 BOOTSTRAP_ENABLED 并让店主登录后修改密码。
 */
@Slf4j
@Component
public class BootstrapOwnerRunner implements ApplicationRunner {

    private final AppProperties.Bootstrap props;
    private final StoreMapper storeMapper;
    private final StaffMapper staffMapper;
    private final PasswordEncoder passwordEncoder;

    public BootstrapOwnerRunner(AppProperties appProperties, StoreMapper storeMapper,
                                StaffMapper staffMapper, PasswordEncoder passwordEncoder) {
        this.props = appProperties.getBootstrap();
        this.storeMapper = storeMapper;
        this.staffMapper = staffMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!props.isEnabled()) {
            return;
        }
        if (storeMapper.selectCount(null) > 0) {
            log.info("已存在门店，跳过初始化");
            return;
        }
        if (!StringUtils.hasText(props.getStoreName()) || !StringUtils.hasText(props.getOwnerUsername())
                || !StringUtils.hasText(props.getOwnerPassword()) || props.getOwnerPassword().length() < 8) {
            throw new IllegalStateException("初始化门店需要配置门店名、店主账号和不少于 8 位的店主密码");
        }
        // .env.example 里的占位文字长度够 8 位：照抄示例文件上线会得到一个仓库里公开的店主密码
        if (props.getOwnerPassword().contains("请改") || props.getOwnerPassword().contains("change")) {
            throw new IllegalStateException("BOOTSTRAP_OWNER_PASSWORD 仍是示例占位值，请改成自己的强密码");
        }
        Store store = new Store();
        store.setName(props.getStoreName());
        store.setBusinessStatus(Store.STATUS_CLOSED);
        store.setAutoAccept(false);
        store.setPayTimeoutMin(15);
        store.setAcceptTimeoutMin(10);
        store.setAfterSaleHours(24);
        storeMapper.insert(store);

        Staff owner = new Staff();
        owner.setStoreId(store.getId());
        owner.setUsername(props.getOwnerUsername().trim());
        owner.setPasswordHash(passwordEncoder.encode(props.getOwnerPassword()));
        owner.setName(props.getOwnerName());
        owner.setRole(Staff.ROLE_OWNER);
        owner.setStatus(Staff.STATUS_ENABLED);
        owner.setTokenVersion(0);
        staffMapper.insert(owner);
        log.info("已初始化门店 [{}] 与店主账号 [{}]", store.getName(), owner.getUsername());
    }
}
