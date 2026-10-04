package com.example.ordering.module.file.service;

import com.example.ordering.config.AppProperties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;

@Service
public class LocalStorageService implements StorageService {

    private final Path root;
    private final String publicPath;

    public LocalStorageService(AppProperties appProperties) {
        AppProperties.Storage s = appProperties.getStorage();
        this.root = Paths.get(s.getLocalDir()).toAbsolutePath().normalize();
        this.publicPath = s.getPublicPath().endsWith("/") ? s.getPublicPath() : s.getPublicPath() + "/";
    }

    @Override
    public String save(String relativePath, byte[] content) {
        Path target = root.resolve(relativePath).normalize();
        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("非法路径: " + relativePath);
        }
        try {
            Files.createDirectories(target.getParent());
            // 先写临时文件再原子替换，避免读到写了一半的图片
            Path tmp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
            Files.write(tmp, content);
            // createTempFile 默认权限为 600，Nginx（不同用户）无法读取，这里放开为 644
            if (Files.getFileStore(tmp).supportsFileAttributeView(PosixFileAttributeView.class)) {
                Files.setPosixFilePermissions(tmp, PosixFilePermissions.fromString("rw-r--r--"));
            }
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("保存文件失败", e);
        }
        return publicPath + relativePath.replace('\\', '/');
    }
}
