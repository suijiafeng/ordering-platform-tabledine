package com.example.ordering.file;

import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UploadIntegrationTest extends AbstractIntegrationTest {

    @Test
    void uploadCompressesAndServesImage() throws Exception {
        BufferedImage img = new BufferedImage(2400, 1200, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(img, "png", png);
        MockMultipartFile file = new MockMultipartFile("file", "big.png", "image/png", png.toByteArray());

        MvcResult r = mvc.perform(authed(multipart("/api/v1/m/files/upload").file(file), ownerToken()))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = data(r);
        assertThat(data.path("width").asInt()).isEqualTo(1080);
        assertThat(data.path("height").asInt()).isEqualTo(540);
        assertThat(data.path("url").asText()).startsWith("/uploads/").endsWith(".jpg");

        // 测试环境由后端直接提供静态访问
        MvcResult served = mvc.perform(get(data.path("thumbnailUrl").asText())).andExpect(status().isOk()).andReturn();
        BufferedImage thumb = ImageIO.read(new ByteArrayInputStream(served.getResponse().getContentAsByteArray()));
        assertThat(thumb.getWidth()).isEqualTo(400);
    }

    @Test
    void rejectsNonImageAndStaff() throws Exception {
        MockMultipartFile fake = new MockMultipartFile("file", "x.png", "image/png", "not an image".getBytes());
        mvc.perform(authed(multipart("/api/v1/m/files/upload").file(fake), ownerToken()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));

        MockMultipartFile txt = new MockMultipartFile("file", "x.txt", "text/plain", "hi".getBytes());
        mvc.perform(authed(multipart("/api/v1/m/files/upload").file(txt), ownerToken()))
                .andExpect(jsonPath("$.code").value(42201));

        mvc.perform(authed(multipart("/api/v1/m/files/upload").file(fake), staffToken()))
                .andExpect(status().isForbidden());
    }

    /** 构造声明 30000×30000 的合法 PNG 文件头：真解码需要数 GB 内存，必须在读头阶段就拒绝 */
    private static byte[] pngBomb() throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        out.write(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'});
        byte[] ihdr = new byte[13];
        java.nio.ByteBuffer.wrap(ihdr).putInt(30000).putInt(30000).put((byte) 8).put((byte) 2).put((byte) 0).put((byte) 0).put((byte) 0);
        writeChunk(out, "IHDR", ihdr);
        writeChunk(out, "IDAT", new byte[]{0x78, (byte) 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01});
        writeChunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    private static void writeChunk(java.io.ByteArrayOutputStream out, String type, byte[] data) throws Exception {
        byte[] t = type.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        out.write(java.nio.ByteBuffer.allocate(4).putInt(data.length).array());
        out.write(t);
        out.write(data);
        java.util.zip.CRC32 crc = new java.util.zip.CRC32();
        crc.update(t);
        crc.update(data);
        out.write(java.nio.ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
    }

    @Test
    void decompressionBombIsRejectedBeforeDecoding() throws Exception {
        String owner = ownerToken();
        MockMultipartFile bomb = new MockMultipartFile("file", "bomb.png", "image/png", pngBomb());
        long before = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/v1/m/files/upload").file(bomb)
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("尺寸过大")));
        long after = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        // 没有真的解码：堆增长远小于一张 30000² 图片（~2.7GB）
        org.assertj.core.api.Assertions.assertThat(after - before).isLessThan(200L * 1024 * 1024);
    }

    @Test
    void imageUrlMustComeFromUploads() throws Exception {
        String owner = ownerToken();
        java.util.Map<String, Object> dish = new java.util.HashMap<>();
        dish.put("categoryId", 1);
        dish.put("name", "外链图");
        dish.put("price", 100);
        dish.put("image", "https://evil.example/track.png");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/m/dishes")
                        .header("Authorization", "Bearer " + owner)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(toJson(dish)))
                .andExpect(status().isUnprocessableEntity());
    }
}
