const symbolLabels = {
  BTCUSDT: "BTC/USDT",
  ETHUSDT: "ETH/USDT",
  SOLUSDT: "SOL/USDT",
  ADAUSDT: "ADA/USDT",
  "USDT.D": "USDT.D",
};
let symbol = "BTCUSDT";
const candleLimit = 500;
const defaultVisibleCandleCount = 100;
const fractalPeriod = 2;
const orderBlockSwingLength = 10;
const orderBlockMaxAtrMultiplier = 3.5;
const maxStoredOrderBlocks = 30;
const visibleOrderBlocksPerSide = 3;
let currentInterval = "1m";
let visibleCandleCount = defaultVisibleCandleCount;
let candleSocket = null;
let tickerSocket = null;
let mainChart = null;
let rsiChart = null;
let macdChart = null;
let candleSeries = null;
let volumeSeries = null;
let ma10Series = null;
let ma20Series = null;
let ma50Series = null;
let ma200Series = null;
let rsiSeries = null;
let rsiDownSeries = null;
let rsiSignalSeries = null;
let rsiOverboughtSeries = null;
let rsiMidlineSeries = null;
let rsiOversoldSeries = null;
let macdSeries = null;
let macdDownSeries = null;
let macdSignalSeries = null;
let macdHistogramSeries = null;
let candleData = [];
let volumeData = [];
let rsiData = [];
let macdLineData = [];
let fractalsEnabled = true;
let orderBlockEnabled = true;
let chartsReadyForSync = false;
let crosshairSyncing = false;

const els = {
  chart: document.querySelector("#chart"),
  maTrendOverlay: document.querySelector("#maTrendOverlay"),
  orderBlockOverlay: document.querySelector("#orderBlockOverlay"),
  rsiChart: document.querySelector("#rsiChart"),
  macdChart: document.querySelector("#macdChart"),
  lastPrice: document.querySelector("#lastPrice"),
  priceChange: document.querySelector("#priceChange"),
  highPrice: document.querySelector("#highPrice"),
  lowPrice: document.querySelector("#lowPrice"),
  highLowRange: document.querySelector("#highLowRange"),
  volume: document.querySelector("#volume"),
  status: document.querySelector("#status"),
  marketSymbol: document.querySelector("#marketSymbol"),
  symbolSelect: document.querySelector("#symbolSelect"),
  candleCount: document.querySelector("#candleCount"),
  themeRadios: document.querySelectorAll('input[name="theme"]'),
  fractalRadios: document.querySelectorAll('input[name="fractals"]'),
  orderBlockRadios: document.querySelectorAll('input[name="orderBlock"]'),
  maColorInputs: document.querySelectorAll("[data-ma-color]"),
  maStyleSelects: document.querySelectorAll("[data-ma-style]"),
  maWidthSelects: document.querySelectorAll("[data-ma-width]"),
  buttons: document.querySelectorAll(".interval"),
};

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const chartThemes = {
  dark: {
    background: "#171b22",
    text: "#c7d0dd",
    grid: "#222a35",
    border: "#2b3441",
    rsiMidline: "rgba(255, 255, 255, 0.92)",
    ma200: "rgba(255, 255, 255, 0.72)",
  },
  light: {
    background: "#ffffff",
    text: "#243244",
    grid: "#e7ecf3",
    border: "#d5dce6",
    rsiMidline: "rgba(17, 24, 39, 0.72)",
    ma200: "rgba(17, 24, 39, 0.72)",
  },
};

const maSettings = {
  10: { color: "#f7525f", style: "solid", width: 1 },
  20: { color: "#ffb347", style: "solid", width: 1 },
  50: { color: "#a78bfa", style: "solid", width: 2 },
  200: { color: "#9ca3af", style: "solid", width: 1 },
};
const maSettingsStorageKey = "cryptoChartMaSettings.v3";

function setStatus(text) {
  els.status.textContent = text;
}

function formatPrice(value) {
  return priceFormatter.format(Number(value));
}

function formatHighLowRange(high, low) {
  const range = high - low;
  const percent = low > 0 ? (range / low) * 100 : 0;
  return `${formatPrice(range)} (${percent.toFixed(2)}%)`;
}

function formatCompact(value) {
  return compactFormatter.format(Number(value || 0));
}

function resetMarketDisplay() {
  els.marketSymbol.textContent = symbolLabels[symbol] || symbol;
  els.lastPrice.textContent = "--";
  els.priceChange.textContent = "--";
  els.priceChange.classList.remove("up", "down");
  els.highPrice.textContent = "--";
  els.lowPrice.textContent = "--";
  els.highLowRange.textContent = "--";
  els.volume.textContent = "--";
}

function clearChartData() {
  candleData = [];
  volumeData = [];
  rsiData = [];
  macdLineData = [];
  candleSeries.setData([]);
  volumeSeries.setData([]);
  ma10Series.setData([]);
  ma20Series.setData([]);
  ma50Series.setData([]);
  ma200Series.setData([]);
  rsiSeries.setData([]);
  rsiDownSeries.setData([]);
  rsiSignalSeries.setData([]);
  rsiOverboughtSeries.setData([]);
  rsiMidlineSeries.setData([]);
  rsiOversoldSeries.setData([]);
  macdSeries.setData([]);
  macdDownSeries.setData([]);
  macdSignalSeries.setData([]);
  macdHistogramSeries.setData([]);
  candleSeries.setMarkers([]);
  drawMainOverlays();
}

function isBinanceSymbol(value) {
  return value.endsWith("USDT");
}

function lineStyleValue(style) {
  const styles = {
    solid: LightweightCharts.LineStyle.Solid,
    dashed: LightweightCharts.LineStyle.Dashed,
    dotted: LightweightCharts.LineStyle.Dotted,
  };
  return styles[style] ?? LightweightCharts.LineStyle.Solid;
}

function maSeriesMap() {
  return {
    10: ma10Series,
    20: ma20Series,
    50: ma50Series,
    200: ma200Series,
  };
}

function updateMaLegend() {
  Object.entries(maSettings).forEach(([period, setting]) => {
    const swatch = document.querySelector(`.ma${period}`);
    if (!swatch) return;
    swatch.style.background = setting.color;
    swatch.style.borderTop = setting.style === "dashed" ? `2px dashed ${setting.color}` : "";
    swatch.style.backgroundImage = setting.style === "dotted"
      ? `radial-gradient(circle, ${setting.color} 45%, transparent 47%)`
      : "";
    swatch.style.backgroundSize = setting.style === "dotted" ? "6px 3px" : "";
    swatch.style.backgroundColor = setting.style === "dotted" ? "transparent" : setting.color;
  });
}

function saveMaSettings() {
  localStorage.setItem(maSettingsStorageKey, JSON.stringify(maSettings));
}

function loadMaSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(maSettingsStorageKey));
    if (!saved || typeof saved !== "object") return;

    Object.entries(saved).forEach(([period, setting]) => {
      if (!maSettings[period]) return;
      if (typeof setting.color === "string") maSettings[period].color = setting.color;
      if (["solid", "dashed", "dotted"].includes(setting.style)) maSettings[period].style = setting.style;
      if ([1, 2, 3].includes(Number(setting.width))) maSettings[period].width = Number(setting.width);
    });
  } catch (error) {
    console.warn("Saved MA settings could not be loaded.", error);
  }
}

function syncMaSettingsControls() {
  els.maColorInputs.forEach((input) => {
    const setting = maSettings[input.dataset.maColor];
    if (setting) input.value = setting.color;
  });

  els.maStyleSelects.forEach((select) => {
    const setting = maSettings[select.dataset.maStyle];
    if (setting) select.value = setting.style;
  });

  els.maWidthSelects.forEach((select) => {
    const setting = maSettings[select.dataset.maWidth];
    if (setting) select.value = String(setting.width);
  });
}

function applyMaSettings() {
  const seriesByPeriod = maSeriesMap();
  Object.entries(maSettings).forEach(([period, setting]) => {
    const series = seriesByPeriod[period];
    if (!series) return;
    series.applyOptions({
      color: setting.color,
      lineStyle: lineStyleValue(setting.style),
      lineWidth: setting.width,
    });
  });
  updateMaLegend();
}

function resizeChartOverlay(canvas) {
  if (!canvas) return null;
  const ratio = window.devicePixelRatio || 1;
  const width = els.chart.clientWidth;
  const height = els.chart.clientHeight;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));

  return {
    ratio,
    cssWidth: canvas.width / ratio,
    cssHeight: canvas.height / ratio,
  };
}

function resizeMaTrendOverlay() {
  return resizeChartOverlay(els.maTrendOverlay);
}

function drawMaTrendBackground() {
  if (!els.maTrendOverlay) return;

  const size = resizeMaTrendOverlay();
  if (!size) return;
  const canvas = els.maTrendOverlay;
  const ctx = canvas.getContext("2d");
  const { ratio, cssWidth, cssHeight } = size;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!mainChart || !candleData.length) return;

  const ma10 = calculateSma(candleData, 10);
  const ma20 = new Map(calculateSma(candleData, 20).map((item) => [item.time, item.value]));
  const ma50 = new Map(calculateSma(candleData, 50).map((item) => [item.time, item.value]));

  let activeZone = null;

  function flushZone(toTime) {
    if (!activeZone) return;

    const x1 = mainChart.timeScale().timeToCoordinate(activeZone.from);
    const x2 = mainChart.timeScale().timeToCoordinate(toTime);
    if (x1 != null && x2 != null) {
      ctx.fillStyle = activeZone.type === "bullish" ? "rgba(255, 235, 59, 0.34)" : "rgba(255, 82, 82, 0.32)";
      ctx.fillRect(Math.min(x1, x2), 0, Math.abs(x2 - x1) + 1, cssHeight);
    }

    activeZone = null;
  }

  for (let index = 1; index < ma10.length; index += 1) {
    const prev = ma10[index - 1];
    const curr = ma10[index];
    const prev20 = ma20.get(prev.time);
    const curr20 = ma20.get(curr.time);
    const prev50 = ma50.get(prev.time);
    const curr50 = ma50.get(curr.time);

    if ([prev20, curr20, prev50, curr50].some((value) => value == null)) continue;

    const bullish = prev.value > prev20 && prev20 > prev50 && curr.value > curr20 && curr20 > curr50;
    const bearish = prev50 > prev20 && prev20 > prev.value && curr50 > curr20 && curr20 > curr.value;
    const nextType = bullish ? "bullish" : bearish ? "bearish" : null;

    if (!nextType) {
      flushZone(prev.time);
      continue;
    }

    if (!activeZone) {
      activeZone = { type: nextType, from: prev.time };
      continue;
    }

    if (activeZone.type !== nextType) {
      flushZone(prev.time);
      activeZone = { type: nextType, from: prev.time };
    }
  }

  if (ma10.length) {
    flushZone(ma10[ma10.length - 1].time);
  }
}

function calculateAtrByIndex(candles, period = 10) {
  const atr = Array(candles.length).fill(null);
  if (candles.length <= period) return atr;

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  let sum = 0;
  trueRanges.forEach((value, index) => {
    sum += value;
    if (index >= period) sum -= trueRanges[index - period];
    if (index >= period - 1) atr[index] = sum / period;
  });

  return atr;
}

function calculateOrderBlocks(candles) {
  if (candles.length < orderBlockSwingLength + 3) return [];

  const atr = calculateAtrByIndex(candles, 10);
  const bullishBlocks = [];
  const bearishBlocks = [];
  let swingType = 0;
  let topSwing = null;
  let bottomSwing = null;

  function addBlock(list, block) {
    const blockSize = Math.abs(block.top - block.bottom);
    const blockAtr = atr[block.createdIndex];
    if (blockAtr == null || blockSize > blockAtr * orderBlockMaxAtrMultiplier) return;

    list.unshift(block);
    if (list.length > maxStoredOrderBlocks) list.pop();
  }

  for (let index = orderBlockSwingLength; index < candles.length; index += 1) {
    const candle = candles[index];
    const candidateIndex = index - orderBlockSwingLength;
    const window = candles.slice(Math.max(0, index - orderBlockSwingLength + 1), index + 1);
    const upper = Math.max(...window.map((item) => item.high));
    const lower = Math.min(...window.map((item) => item.low));
    const previousSwingType = swingType;

    if (candles[candidateIndex].high > upper) {
      swingType = 0;
    } else if (candles[candidateIndex].low < lower) {
      swingType = 1;
    }

    if (swingType === 0 && previousSwingType !== 0) {
      topSwing = {
        x: candidateIndex,
        y: candles[candidateIndex].high,
        crossed: false,
      };
    }

    if (swingType === 1 && previousSwingType !== 1) {
      bottomSwing = {
        x: candidateIndex,
        y: candles[candidateIndex].low,
        crossed: false,
      };
    }

    for (let listIndex = bullishBlocks.length - 1; listIndex >= 0; listIndex -= 1) {
      const currentBlock = bullishBlocks[listIndex];
      if (!currentBlock.breaker) {
        if (candle.low < currentBlock.bottom) {
          currentBlock.breaker = true;
          currentBlock.breakTime = candle.time;
        }
      } else if (candle.high > currentBlock.top) {
        bullishBlocks.splice(listIndex, 1);
      }
    }

    for (let listIndex = bearishBlocks.length - 1; listIndex >= 0; listIndex -= 1) {
      const currentBlock = bearishBlocks[listIndex];
      if (!currentBlock.breaker) {
        if (candle.high > currentBlock.top) {
          currentBlock.breaker = true;
          currentBlock.breakTime = candle.time;
        }
      } else if (candle.low < currentBlock.bottom) {
        bearishBlocks.splice(listIndex, 1);
      }
    }

    if (topSwing && !topSwing.crossed && candle.close > topSwing.y) {
      topSwing.crossed = true;

      let boxBottom = candles[index - 1].high;
      let boxTop = candles[index - 1].low;
      let boxIndex = index - 1;

      for (let cursor = index - 1; cursor > topSwing.x; cursor -= 1) {
        if (candles[cursor].low < boxBottom) {
          boxBottom = candles[cursor].low;
          boxTop = candles[cursor].high;
          boxIndex = cursor;
        }
      }

      addBlock(bullishBlocks, {
        type: "Bull",
        top: boxTop,
        bottom: boxBottom,
        startTime: candles[boxIndex].time,
        volume: candle.volume + (candles[index - 1]?.volume || 0) + (candles[index - 2]?.volume || 0),
        highVolume: candle.volume + (candles[index - 1]?.volume || 0),
        lowVolume: candles[index - 2]?.volume || 0,
        breaker: false,
        breakTime: null,
        createdIndex: index,
      });
    }

    if (bottomSwing && !bottomSwing.crossed && candle.close < bottomSwing.y) {
      bottomSwing.crossed = true;

      let boxBottom = candles[index - 1].low;
      let boxTop = candles[index - 1].high;
      let boxIndex = index - 1;

      for (let cursor = index - 1; cursor > bottomSwing.x; cursor -= 1) {
        if (candles[cursor].high > boxTop) {
          boxTop = candles[cursor].high;
          boxBottom = candles[cursor].low;
          boxIndex = cursor;
        }
      }

      addBlock(bearishBlocks, {
        type: "Bear",
        top: boxTop,
        bottom: boxBottom,
        startTime: candles[boxIndex].time,
        volume: candle.volume + (candles[index - 1]?.volume || 0) + (candles[index - 2]?.volume || 0),
        highVolume: candles[index - 2]?.volume || 0,
        lowVolume: candle.volume + (candles[index - 1]?.volume || 0),
        breaker: false,
        breakTime: null,
        createdIndex: index,
      });
    }
  }

  return [
    ...bullishBlocks.slice(0, visibleOrderBlocksPerSide),
    ...bearishBlocks.slice(0, visibleOrderBlocksPerSide),
  ].sort((first, second) => first.startTime - second.startTime);
}

function drawOrderBlockOverlay() {
  if (!els.orderBlockOverlay) return;

  const size = resizeChartOverlay(els.orderBlockOverlay);
  if (!size) return;

  const canvas = els.orderBlockOverlay;
  const ctx = canvas.getContext("2d");
  const { ratio, cssWidth, cssHeight } = size;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!orderBlockEnabled || !mainChart || !candleSeries || !candleData.length) return;

  const latestTime = candleData.at(-1).time;
  const intervalSeconds = candleData.length > 1 ? Math.max(1, candleData.at(-1).time - candleData.at(-2).time) : 60;
  const blocks = calculateOrderBlocks(candleData);
  const textColor = currentThemeName() === "light" ? "rgba(17, 24, 39, 0.72)" : "rgba(255, 255, 255, 0.76)";

  blocks.forEach((block) => {
    const startX = mainChart.timeScale().timeToCoordinate(block.startTime);
    const endTime = block.breakTime || latestTime + intervalSeconds;
    const endX = mainChart.timeScale().timeToCoordinate(endTime);
    const topY = candleSeries.priceToCoordinate(block.top);
    const bottomY = candleSeries.priceToCoordinate(block.bottom);

    if ([startX, endX, topY, bottomY].some((value) => value == null)) return;

    const x = Math.min(startX, endX);
    const y = Math.min(topY, bottomY);
    const width = Math.max(16, Math.abs(endX - startX));
    const height = Math.max(10, Math.abs(bottomY - topY));
    const isBull = block.type === "Bull";
    const fill = isBull ? "rgba(8, 153, 129, 0.28)" : "rgba(242, 54, 70, 0.28)";
    const stroke = isBull ? "rgba(8, 153, 129, 0.72)" : "rgba(242, 54, 70, 0.72)";
    const barWidth = Math.min(width * 0.34, 74);
    const highRatio = block.volume > 0 ? block.highVolume / block.volume : 0.5;
    const lowRatio = block.volume > 0 ? block.lowVolume / block.volume : 0.5;

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);

    ctx.fillStyle = "rgba(8, 153, 129, 0.34)";
    ctx.fillRect(x, y, Math.max(4, barWidth * highRatio), height / 2);
    ctx.fillStyle = "rgba(242, 54, 70, 0.34)";
    ctx.fillRect(x, y + height / 2, Math.max(4, barWidth * lowRatio), height / 2);

    ctx.strokeStyle = textColor;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y + height / 2);
    ctx.lineTo(x + barWidth, y + height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (height >= 18 && width >= 64) {
      ctx.fillStyle = textColor;
      ctx.font = "700 11px Inter, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`${formatCompact(block.volume)} Order Block`, x + barWidth + 8, y + height / 2);
    }
  });
}

function drawMainOverlays() {
  drawMaTrendBackground();
  drawOrderBlockOverlay();
}

function currentThemeName() {
  return document.body.dataset.theme === "light" ? "light" : "dark";
}

function currentChartTheme() {
  return chartThemes[currentThemeName()];
}

function chartOptions(container) {
  const theme = currentChartTheme();
  return {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: theme.background },
      textColor: theme.text,
      fontFamily: getComputedStyle(document.body).fontFamily,
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    },
    rightPriceScale: {
      borderColor: theme.border,
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
  };
}

function applyIndicatorTimeAxisVisibility() {
  [rsiChart, macdChart].forEach((chart) => {
    if (!chart) return;
    chart.applyOptions({
      timeScale: {
        visible: false,
        timeVisible: false,
        secondsVisible: false,
      },
    });
  });
}

function createCharts() {
  mainChart = LightweightCharts.createChart(els.chart, chartOptions(els.chart));
  rsiChart = LightweightCharts.createChart(els.rsiChart, chartOptions(els.rsiChart));
  macdChart = LightweightCharts.createChart(els.macdChart, chartOptions(els.macdChart));
  applyIndicatorTimeAxisVisibility();

  candleSeries = mainChart.addCandlestickSeries({
    upColor: "#22ab94",
    downColor: "#f7525f",
    borderUpColor: "#22ab94",
    borderDownColor: "#f7525f",
    wickUpColor: "#22ab94",
    wickDownColor: "#f7525f",
  });

  volumeSeries = mainChart.addHistogramSeries({
    color: "#4ea1ff",
    priceFormat: { type: "volume" },
    priceScaleId: "",
  });

  volumeSeries.priceScale().applyOptions({
    scaleMargins: {
      top: 0.82,
      bottom: 0,
    },
  });

  ma10Series = mainChart.addLineSeries({
    color: maSettings[10].color,
    lineStyle: lineStyleValue(maSettings[10].style),
    lineWidth: maSettings[10].width,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  ma20Series = mainChart.addLineSeries({
    color: maSettings[20].color,
    lineStyle: lineStyleValue(maSettings[20].style),
    lineWidth: maSettings[20].width,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  ma50Series = mainChart.addLineSeries({
    color: maSettings[50].color,
    lineStyle: lineStyleValue(maSettings[50].style),
    lineWidth: maSettings[50].width,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  ma200Series = mainChart.addLineSeries({
    color: maSettings[200].color,
    lineStyle: lineStyleValue(maSettings[200].style),
    lineWidth: maSettings[200].width,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });

  const rsiAutoscaleInfoProvider = () => ({
    priceRange: {
      minValue: 0,
      maxValue: 100,
    },
  });

  rsiSeries = rsiChart.addLineSeries({
    color: "#f5a524",
    lineWidth: 3,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    autoscaleInfoProvider: rsiAutoscaleInfoProvider,
  });
  rsiDownSeries = rsiChart.addLineSeries({
    color: "#f7525f",
    lineWidth: 3,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    autoscaleInfoProvider: rsiAutoscaleInfoProvider,
  });
  rsiSignalSeries = rsiChart.addLineSeries({
    color: "#4ea1ff",
    lineWidth: 1,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    autoscaleInfoProvider: rsiAutoscaleInfoProvider,
  });
  rsiOverboughtSeries = rsiChart.addLineSeries({
    color: "rgba(247, 82, 95, 0.85)",
    lineStyle: LightweightCharts.LineStyle.Dotted,
    lineWidth: 1,
    priceLineVisible: false,
    autoscaleInfoProvider: rsiAutoscaleInfoProvider,
  });
  rsiMidlineSeries = rsiChart.addLineSeries({
    color: "rgba(255, 255, 255, 0.92)",
    lineStyle: LightweightCharts.LineStyle.Dotted,
    lineWidth: 2,
    priceLineVisible: false,
    autoscaleInfoProvider: rsiAutoscaleInfoProvider,
  });
  rsiOversoldSeries = rsiChart.addLineSeries({
    color: "rgba(34, 171, 148, 0.85)",
    lineStyle: LightweightCharts.LineStyle.Dotted,
    lineWidth: 1,
    priceLineVisible: false,
    autoscaleInfoProvider: rsiAutoscaleInfoProvider,
  });
  rsiChart.priceScale("right").applyOptions({
    scaleMargins: { top: 0.1, bottom: 0.1 },
  });

  macdHistogramSeries = macdChart.addHistogramSeries({
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  macdSeries = macdChart.addLineSeries({
    color: "#f5a524",
    lineWidth: 2,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  macdDownSeries = macdChart.addLineSeries({
    color: "#f7525f",
    lineWidth: 2,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  macdSignalSeries = macdChart.addLineSeries({
    color: "#a78bfa",
    lineWidth: 1,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });

  syncVisibleRanges([mainChart, rsiChart, macdChart]);
  syncCrosshairs();
  observeChartSize(els.chart, mainChart);
  observeChartSize(els.rsiChart, rsiChart);
  observeChartSize(els.macdChart, macdChart);
  applyMaSettings();
}

function applyChartTheme() {
  if (!mainChart || !rsiChart || !macdChart) return;

  const theme = currentChartTheme();
  const options = {
    layout: {
      background: { color: theme.background },
      textColor: theme.text,
      fontFamily: getComputedStyle(document.body).fontFamily,
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    },
    rightPriceScale: {
      borderColor: theme.border,
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: true,
      secondsVisible: false,
    },
  };

  [mainChart, rsiChart, macdChart].forEach((chart) => chart.applyOptions(options));
  applyIndicatorTimeAxisVisibility();
  rsiMidlineSeries.applyOptions({ color: theme.rsiMidline });
  applyMaSettings();
  drawMainOverlays();
}

function observeChartSize(container, chart) {
  new ResizeObserver(() => {
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    });
    if (chart === mainChart) {
      drawMainOverlays();
    }
  }).observe(container);
}

function syncVisibleRanges(charts) {
  let syncing = false;

  charts.forEach((sourceChart) => {
    sourceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (syncing || !chartsReadyForSync || !range || range.from == null || range.to == null) {
        return;
      }
      syncing = true;
      charts.forEach((targetChart) => {
        if (targetChart !== sourceChart) {
          try {
            targetChart.timeScale().setVisibleRange(range);
          } catch (error) {
            console.warn("Time range sync skipped until chart data is ready.", error);
          }
        }
      });
      syncing = false;
      drawMainOverlays();
    });
  });
}

function findValueAtTime(items, time, key = "value") {
  const found = items.find((item) => item.time === time);
  return found ? found[key] : undefined;
}

function clearSyncedCrosshairs(sourceChart, configs) {
  configs.forEach((config) => {
    if (config.chart !== sourceChart && typeof config.chart.clearCrosshairPosition === "function") {
      config.chart.clearCrosshairPosition();
    }
  });
}

function syncCrosshairs() {
  const configs = [
    {
      chart: mainChart,
      series: candleSeries,
      valueForTime: (time) => findValueAtTime(candleData, time, "close") ?? candleData.at(-1)?.close ?? 0,
    },
    {
      chart: rsiChart,
      series: rsiSeries,
      valueForTime: (time) => findValueAtTime(rsiData, time) ?? 50,
    },
    {
      chart: macdChart,
      series: macdSeries,
      valueForTime: (time) => findValueAtTime(macdLineData, time) ?? 0,
    },
  ];

  configs.forEach((source) => {
    source.chart.subscribeCrosshairMove((param) => {
      if (crosshairSyncing) return;

      crosshairSyncing = true;
      if (!param?.time || !param?.point) {
        clearSyncedCrosshairs(source.chart, configs);
        crosshairSyncing = false;
        return;
      }

      configs.forEach((target) => {
        if (target.chart === source.chart) return;

        target.chart.setCrosshairPosition(target.valueForTime(param.time), param.time, target.series);
      });

      crosshairSyncing = false;
    });
  });
}

function clampVisibleCandleCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultVisibleCandleCount;
  return Math.min(candleLimit, Math.max(20, parsed));
}

function applyVisibleCandleRange() {
  if (!candleData.length) return;

  const startIndex = Math.max(0, candleData.length - visibleCandleCount);
  const visibleRange = {
    from: candleData[startIndex].time,
    to: candleData[candleData.length - 1].time,
  };

  chartsReadyForSync = false;
  [mainChart, rsiChart, macdChart].forEach((item) => item.timeScale().setVisibleRange(visibleRange));
  chartsReadyForSync = true;
  drawMainOverlays();
}

function toCandle(kline) {
  return {
    time: Math.floor(kline[0] / 1000),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
  };
}

function toVolume(kline) {
  const open = Number(kline[1]);
  const close = Number(kline[4]);
  return {
    time: Math.floor(kline[0] / 1000),
    value: Number(kline[5]),
    color: close >= open ? "rgba(34, 171, 148, 0.45)" : "rgba(247, 82, 95, 0.45)",
  };
}

function calculateRsi(candles, period = 14) {
  if (candles.length <= period) return [];

  const result = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result.push({
    time: candles[period].time,
    value: averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss),
  });

  for (let i = period + 1; i < candles.length; i += 1) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result.push({
      time: candles[i].time,
      value: averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss),
    });
  }

  return result;
}

function calculateSma(candles, period) {
  if (candles.length < period) return [];

  const result = [];
  let sum = 0;

  candles.forEach((candle, index) => {
    sum += candle.close;

    if (index >= period) {
      sum -= candles[index - period].close;
    }

    if (index >= period - 1) {
      result.push({
        time: candle.time,
        value: sum / period,
      });
    }
  });

  return result;
}

function calculateLineSma(values, period) {
  if (values.length < period) return [];

  const result = [];
  let sum = 0;

  values.forEach((item, index) => {
    sum += item.value;

    if (index >= period) {
      sum -= values[index - period].value;
    }

    if (index >= period - 1) {
      result.push({
        time: item.time,
        value: sum / period,
      });
    }
  });

  return result;
}

function colorLineBySignal(lineData, signalData) {
  const signalByTime = new Map(signalData.map((item) => [item.time, item.value]));

  return lineData.map((item) => {
    const signal = signalByTime.get(item.time);
    return {
      ...item,
      color: signal == null || item.value >= signal ? "#22ab94" : "#f7525f",
    };
  });
}

function calculateEma(values, period) {
  const multiplier = 2 / (period + 1);
  const ema = [];
  let previous = null;

  values.forEach((item, index) => {
    if (index === period - 1) {
      const seed = values.slice(0, period).reduce((sum, value) => sum + value.close, 0) / period;
      previous = seed;
      ema.push({ time: item.time, value: seed });
      return;
    }

    if (index >= period) {
      previous = (item.close - previous) * multiplier + previous;
      ema.push({ time: item.time, value: previous });
    }
  });

  return ema;
}

function calculateMacd(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = calculateEma(candles, fastPeriod);
  const slowEma = calculateEma(candles, slowPeriod);
  const fastByTime = new Map(fastEma.map((item) => [item.time, item.value]));
  const macd = slowEma
    .filter((item) => fastByTime.has(item.time))
    .map((item) => ({
      time: item.time,
      close: fastByTime.get(item.time) - item.value,
    }));
  const signal = calculateEma(macd, signalPeriod).map((item) => ({
    time: item.time,
    value: item.value,
  }));
  const signalByTime = new Map(signal.map((item) => [item.time, item.value]));
  const macdLine = macd.map((item) => ({ time: item.time, value: item.close }));
  const histogram = macd
    .filter((item) => signalByTime.has(item.time))
    .map((item) => {
      const value = item.close - signalByTime.get(item.time);
      return {
        time: item.time,
        value,
        color: value >= 0 ? "rgba(34, 171, 148, 0.5)" : "rgba(247, 82, 95, 0.5)",
      };
    });

  return { macdLine, signal, histogram };
}

function calculateWilliamsFractalMarkers(candles, n = fractalPeriod) {
  const markers = [];
  if (candles.length < n * 2 + 5) return markers;

  for (let center = n + 4; center < candles.length - n; center += 1) {
    const centerHigh = candles[center].high;
    const centerLow = candles[center].low;
    let upflagDownFrontier = true;
    let upflagUpFrontier0 = true;
    let upflagUpFrontier1 = true;
    let upflagUpFrontier2 = true;
    let upflagUpFrontier3 = true;
    let upflagUpFrontier4 = true;
    let downflagDownFrontier = true;
    let downflagUpFrontier0 = true;
    let downflagUpFrontier1 = true;
    let downflagUpFrontier2 = true;
    let downflagUpFrontier3 = true;
    let downflagUpFrontier4 = true;

    for (let i = 1; i <= n; i += 1) {
      upflagDownFrontier = upflagDownFrontier && candles[center + i].high < centerHigh;
      upflagUpFrontier0 = upflagUpFrontier0 && candles[center - i].high < centerHigh;
      upflagUpFrontier1 = upflagUpFrontier1 && candles[center - 1].high <= centerHigh && candles[center - i - 1].high < centerHigh;
      upflagUpFrontier2 = upflagUpFrontier2 && candles[center - 1].high <= centerHigh && candles[center - 2].high <= centerHigh && candles[center - i - 2].high < centerHigh;
      upflagUpFrontier3 = upflagUpFrontier3 && candles[center - 1].high <= centerHigh && candles[center - 2].high <= centerHigh && candles[center - 3].high <= centerHigh && candles[center - i - 3].high < centerHigh;
      upflagUpFrontier4 = upflagUpFrontier4 && candles[center - 1].high <= centerHigh && candles[center - 2].high <= centerHigh && candles[center - 3].high <= centerHigh && candles[center - 4].high <= centerHigh && candles[center - i - 4].high < centerHigh;

      downflagDownFrontier = downflagDownFrontier && candles[center + i].low > centerLow;
      downflagUpFrontier0 = downflagUpFrontier0 && candles[center - i].low > centerLow;
      downflagUpFrontier1 = downflagUpFrontier1 && candles[center - 1].low >= centerLow && candles[center - i - 1].low > centerLow;
      downflagUpFrontier2 = downflagUpFrontier2 && candles[center - 1].low >= centerLow && candles[center - 2].low >= centerLow && candles[center - i - 2].low > centerLow;
      downflagUpFrontier3 = downflagUpFrontier3 && candles[center - 1].low >= centerLow && candles[center - 2].low >= centerLow && candles[center - 3].low >= centerLow && candles[center - i - 3].low > centerLow;
      downflagUpFrontier4 = downflagUpFrontier4 && candles[center - 1].low >= centerLow && candles[center - 2].low >= centerLow && candles[center - 3].low >= centerLow && candles[center - 4].low >= centerLow && candles[center - i - 4].low > centerLow;
    }

    if (upflagDownFrontier && (upflagUpFrontier0 || upflagUpFrontier1 || upflagUpFrontier2 || upflagUpFrontier3 || upflagUpFrontier4)) {
      markers.push({
        time: candles[center].time,
        position: "aboveBar",
        color: "#009688",
        shape: "arrowDown",
        size: 1,
      });
    }

    if (downflagDownFrontier && (downflagUpFrontier0 || downflagUpFrontier1 || downflagUpFrontier2 || downflagUpFrontier3 || downflagUpFrontier4)) {
      markers.push({
        time: candles[center].time,
        position: "belowBar",
        color: "#F44336",
        shape: "arrowUp",
        size: 1,
      });
    }
  }

  return markers.sort((first, second) => first.time - second.time);
}

function updateFractalMarkers() {
  if (!candleSeries) return;
  candleSeries.setMarkers(fractalsEnabled ? calculateWilliamsFractalMarkers(candleData) : []);
}

function updateIndicators() {
  const rsi = calculateRsi(candleData);
  const macd = calculateMacd(candleData);
  const rsiSignal = calculateLineSma(rsi, 9);
  const coloredRsi = colorLineBySignal(rsi, rsiSignal);
  const coloredMacd = colorLineBySignal(macd.macdLine, macd.signal);
  rsiData = rsi;
  macdLineData = macd.macdLine;

  ma10Series.setData(calculateSma(candleData, 10));
  ma20Series.setData(calculateSma(candleData, 20));
  ma50Series.setData(calculateSma(candleData, 50));
  ma200Series.setData(calculateSma(candleData, 200));
  rsiSeries.setData(coloredRsi);
  rsiDownSeries.setData([]);
  rsiSignalSeries.setData(rsiSignal);
  rsiOverboughtSeries.setData(candleData.map((item) => ({ time: item.time, value: 70 })));
  rsiMidlineSeries.setData(candleData.map((item) => ({ time: item.time, value: 50 })));
  rsiOversoldSeries.setData(candleData.map((item) => ({ time: item.time, value: 30 })));
  macdSeries.setData(coloredMacd);
  macdDownSeries.setData([]);
  macdSignalSeries.setData(macd.signal);
  macdHistogramSeries.setData(macd.histogram);
  updateFractalMarkers();
  drawMainOverlays();
}

async function loadCandles(interval) {
  if (!isBinanceSymbol(symbol)) {
    closeCandleSocket();
    chartsReadyForSync = false;
    clearChartData();
    setStatus("USDT.D 차트 미지원");
    return;
  }

  setStatus("데이터 로딩");
  closeCandleSocket();
  chartsReadyForSync = false;

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${candleLimit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("캔들 데이터를 가져오지 못했습니다.");
  }

  const klines = await response.json();
  candleData = klines.map(toCandle);
  volumeData = klines.map(toVolume);
  candleSeries.setData(candleData);
  volumeSeries.setData(volumeData);
  updateIndicators();
  applyVisibleCandleRange();
  setStatus("실시간 연결");
  openCandleSocket(interval);
}

function closeCandleSocket() {
  if (candleSocket) {
    candleSocket.close();
    candleSocket = null;
  }
}

function closeTickerSocket() {
  if (tickerSocket) {
    tickerSocket.close();
    tickerSocket = null;
  }
}

function upsertByTime(items, nextItem) {
  const last = items.at(-1);
  if (last && last.time === nextItem.time) {
    items[items.length - 1] = nextItem;
    return;
  }
  items.push(nextItem);
  if (items.length > candleLimit) items.shift();
}

function openCandleSocket(interval) {
  if (!isBinanceSymbol(symbol)) return;

  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  candleSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

  candleSocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const kline = message.k;
    const open = Number(kline.o);
    const close = Number(kline.c);
    const time = Math.floor(kline.t / 1000);
    const nextCandle = {
      time,
      open,
      high: Number(kline.h),
      low: Number(kline.l),
      close,
      volume: Number(kline.v),
    };
    const nextVolume = {
      time,
      value: Number(kline.v),
      color: close >= open ? "rgba(34, 171, 148, 0.45)" : "rgba(247, 82, 95, 0.45)",
    };

    upsertByTime(candleData, nextCandle);
    upsertByTime(volumeData, nextVolume);
    candleSeries.update(nextCandle);
    volumeSeries.update(nextVolume);
    updateIndicators();
    applyVisibleCandleRange();
  };

  candleSocket.onopen = () => setStatus("실시간 연결");
  candleSocket.onerror = () => setStatus("연결 오류");
  candleSocket.onclose = () => {
    if (currentInterval === interval) {
      setStatus("연결 종료");
    }
  };
}

function openTickerSocket() {
  closeTickerSocket();
  if (!isBinanceSymbol(symbol)) {
    setStatus("USDT.D 차트 미지원");
    return;
  }

  tickerSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);

  tickerSocket.onmessage = (event) => {
    const ticker = JSON.parse(event.data);
    const change = Number(ticker.P);
    const high = Number(ticker.h);
    const low = Number(ticker.l);

    els.lastPrice.textContent = formatPrice(ticker.c);
    els.highPrice.textContent = formatPrice(high);
    els.lowPrice.textContent = formatPrice(low);
    els.highLowRange.textContent = formatHighLowRange(high, low);
    els.volume.textContent = `${compactFormatter.format(Number(ticker.v))} ${symbolLabels[symbol].split("/")[0]}`;
    els.priceChange.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    els.priceChange.classList.toggle("up", change >= 0);
    els.priceChange.classList.toggle("down", change < 0);
  };
}

function bindControls() {
  els.maColorInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const period = input.dataset.maColor;
      maSettings[period].color = input.value;
      saveMaSettings();
      applyMaSettings();
    });
  });

  els.maStyleSelects.forEach((select) => {
    select.addEventListener("change", () => {
      const period = select.dataset.maStyle;
      maSettings[period].style = select.value;
      saveMaSettings();
      applyMaSettings();
    });
  });

  els.maWidthSelects.forEach((select) => {
    select.addEventListener("change", () => {
      const period = select.dataset.maWidth;
      maSettings[period].width = Number(select.value);
      saveMaSettings();
      applyMaSettings();
    });
  });

  els.themeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      document.body.dataset.theme = radio.value;
      applyChartTheme();
    });
  });

  els.fractalRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      fractalsEnabled = radio.value === "on";
      updateFractalMarkers();
    });
  });

  els.orderBlockRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      orderBlockEnabled = radio.value === "on";
      drawOrderBlockOverlay();
    });
  });

  els.symbolSelect.addEventListener("change", async () => {
    symbol = els.symbolSelect.value;
    resetMarketDisplay();
    closeTickerSocket();

    if (!isBinanceSymbol(symbol)) {
      closeCandleSocket();
      clearChartData();
      setStatus("USDT.D 차트 미지원");
      return;
    }

    openTickerSocket();

    try {
      await loadCandles(currentInterval);
    } catch (error) {
      setStatus("데이터 오류");
      console.error(error);
    }
  });

  els.candleCount.addEventListener("change", () => {
    visibleCandleCount = clampVisibleCandleCount(els.candleCount.value);
    els.candleCount.value = visibleCandleCount;
    applyVisibleCandleRange();
  });

  els.candleCount.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      els.candleCount.blur();
    }
  });

  els.buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const interval = button.dataset.interval;
      if (interval === currentInterval) return;

      currentInterval = interval;
      els.buttons.forEach((item) => item.classList.toggle("active", item === button));

      try {
        await loadCandles(currentInterval);
      } catch (error) {
        setStatus("데이터 오류");
        console.error(error);
      }
    });
  });
}

async function init() {
  loadMaSettings();
  syncMaSettingsControls();
  resetMarketDisplay();
  createCharts();
  bindControls();
  openTickerSocket();

  try {
    await loadCandles(currentInterval);
  } catch (error) {
    setStatus("데이터 오류");
    console.error(error);
  }
}

window.addEventListener("beforeunload", () => {
  closeCandleSocket();
  closeTickerSocket();
});

init();
