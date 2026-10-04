package com.example.ordering.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 接口文档：dev 环境访问 /swagger-ui.html；生产环境关闭（application-prod.yml）。
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI orderingOpenApi() {
        return new OpenAPI()
                .info(new Info().title("点餐平台 API").version("v1"))
                .components(new Components().addSecuritySchemes("bearer",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }

    @Bean
    public GroupedOpenApi customerApi() {
        return GroupedOpenApi.builder().group("1-顾客端").pathsToMatch("/api/v1/c/**").build();
    }

    @Bean
    public GroupedOpenApi merchantApi() {
        return GroupedOpenApi.builder().group("2-商家端").pathsToMatch("/api/v1/m/**").build();
    }
}
