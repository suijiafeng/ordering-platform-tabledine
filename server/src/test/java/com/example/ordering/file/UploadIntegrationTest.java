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
}
