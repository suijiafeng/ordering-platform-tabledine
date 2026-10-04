package com.example.ordering.module.report.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.report.dto.DashboardToday;
import com.example.ordering.module.report.service.DashboardService;
import com.example.ordering.module.report.service.ReportExportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

@Tag(name = "商家端-看板与导出")
@RestController
@RequestMapping("/api/v1/m")
public class MerchantReportController {

    private final DashboardService dashboardService;
    private final ReportExportService exportService;

    public MerchantReportController(DashboardService dashboardService, ReportExportService exportService) {
        this.dashboardService = dashboardService;
        this.exportService = exportService;
    }

    @Operation(summary = "今日看板：实收、订单量、退款、待处理、菜品排行、近 7 天")
    @PreAuthorize("hasRole('OWNER')")
    @GetMapping("/dashboard/today")
    public Result<DashboardToday> today() {
        return Result.ok(dashboardService.today());
    }

    @Operation(summary = "流水导出 CSV（店主）：from / to = yyyy-MM-dd，按下单日期")
    @PreAuthorize("hasRole('OWNER')")
    @GetMapping(value = "/reports/export", produces = "text/csv")
    public ResponseEntity<byte[]> export(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String csv = exportService.exportCsv(from, to);
        String filename = "orders-" + from + "_" + to + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(csv.getBytes(StandardCharsets.UTF_8));
    }
}
