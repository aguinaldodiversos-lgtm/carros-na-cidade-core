function calculateTargets(city) {
  const population = city.population || 50000;

  if (population < 50000) {
    return {
      dealers: 10,
      ads: 50,
      traffic: 1000,
    };
  }

  if (population < 200000) {
    return {
      dealers: 30,
      ads: 200,
      traffic: 5000,
    };
  }

  return {
    dealers: 80,
    ads: 600,
    traffic: 15000,
  };
}

function evaluateStatus(current, target) {
  if (
    current.dealers >= target.dealers &&
    current.ads >= target.ads &&
    current.traffic >= target.traffic
  ) {
    return "dominant";
  }

  if (
    current.dealers >= target.dealers * 0.6 &&
    current.ads >= target.ads * 0.6
  ) {
    return "ready";
  }

  return "building";
}

module.exports = {
  calculateTargets,
  evaluateStatus,
};
