package com.example.ordering.module.file.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.file.dto.UploadResult;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/**
 * 图片上传：校验 → 压缩为 JPEG（主图 + 缩略图）→ 存储。
 * 统一转 JPEG：去除 EXIF 等元数据，透明背景填充为白色。
 */
@Service
public class ImageUploadService {

    private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png");
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final int MAX_PIXELS_SIDE = 8000;
    private static final float JPEG_QUALITY = 0.85f;

    private final StorageService storageService;
    private final AppProperties.Storage props;

    public ImageUploadService(StorageService storageService, AppProperties appProperties) {
        this.storageService = storageService;
        this.props = appProperties.getStorage();
    }

    public UploadResult upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "请选择图片");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "图片不能超过 5MB");
        }
        if (file.getContentType() == null || !ALLOWED_TYPES.contains(file.getContentType().toLowerCase())) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "仅支持 JPG / PNG 图片");
        }
        BufferedImage src;
        try (InputStream in = file.getInputStream()) {
            src = ImageIO.read(in);
        } catch (IOException e) {
            src = null;
        }
        // 以实际解码结果为准，不信任客户端声明的 Content-Type
        if (src == null) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "无法识别的图片文件");
        }
        if (src.getWidth() > MAX_PIXELS_SIDE || src.getHeight() > MAX_PIXELS_SIDE) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "图片尺寸过大");
        }

        BufferedImage main = resize(src, props.getMaxSize());
        BufferedImage thumb = resize(src, props.getThumbSize());
        LocalDate today = LocalDate.now();
        String dir = String.format("%d/%02d/", today.getYear(), today.getMonthValue());
        String name = UUID.randomUUID().toString().replace("-", "");

        String url = storageService.save(dir + name + ".jpg", toJpeg(main));
        String thumbUrl = storageService.save(dir + name + "_thumb.jpg", toJpeg(thumb));
        return new UploadResult(url, thumbUrl, main.getWidth(), main.getHeight());
    }

    /** 按最长边等比缩放（不放大），绘制到白底 RGB 画布 */
    static BufferedImage resize(BufferedImage src, int maxSide) {
        int w = src.getWidth();
        int h = src.getHeight();
        double scale = Math.min(1.0, (double) maxSide / Math.max(w, h));
        int tw = Math.max(1, (int) Math.round(w * scale));
        int th = Math.max(1, (int) Math.round(h * scale));
        BufferedImage out = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, tw, th);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(src, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    static byte[] toJpeg(BufferedImage image) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(bos)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("图片压缩失败", e);
        } finally {
            writer.dispose();
        }
        return bos.toByteArray();
    }
}
