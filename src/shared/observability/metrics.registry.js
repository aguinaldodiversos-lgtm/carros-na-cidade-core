const counters = new Map();
const gauges = new Map();
const histograms = new Map();

function keyOf(name, labels = {}) {
  const ordered = Object.keys(labels)
    .sort()
    .reduce((acc, key) => {
      acc[key] = labels[key];
      return acc;
    }, {});
  return `${name}:${JSON.stringify(ordered)}`;
}

export function incrementCounter(name, value = 1, labels = {}) {
  const key = keyOf(name, labels);
  counters.set(key, {
    name,
    labels,
    value: (counters.get(key)?.value || 0) + value,
  });
}

export function setGauge(name, value, labels = {}) {
  const key = keyOf(name, labels);
  gauges.set(key, { name, labels, value });
}

export function observeHistogram(name, value, labels = {}) {
  const key = keyOf(name, labels);
  const current = histograms.get(key) || {
    name,
    labels,
    count: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
  };

  current.count += 1;
  current.sum += value;
  current.min = Math.min(current.min, value);
  current.max = Math.max(current.max, value);

  histograms.set(key, current);
}

export function getMetricsSnapshot() {
  return {
    counters: [...counters.values()],
    gauges: [...gauges.values()],
    histograms: [...histograms.values()].map((item) => ({
      ...item,
      avg: item.count > 0 ? item.sum / item.count : 0,
    })),
    generatedAt: new Date().toISOString(),
  };
}
