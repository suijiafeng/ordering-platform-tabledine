package com.example.ordering.module.file.service;

/**
 * 文件存储抽象。MVP 使用本地磁盘（Docker 卷）；切换 OSS 时新增实现即可。
 */
public interface StorageService {

    /**
     * 保存文件。
     *
     * @param relativePath 相对路径，例如 2026/10/abc.jpg
     * @return 对外访问路径，例如 /uploads/2026/10/abc.jpg
     */
    String save(String relativePath, byte[] content);
}
