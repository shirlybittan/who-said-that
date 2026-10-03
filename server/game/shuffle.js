// Unbiased Fisher–Yates shuffles. `.sort(() => Math.random() - 0.5)` is
// biased (some orders come up far more often) and was used in several places.

/** Shuffle `arr` in place and return it. */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A shuffled copy of `arr`. */
const fisherYatesShuffle = (arr) => shuffleInPlace([...arr]);

module.exports = { fisherYatesShuffle, shuffleInPlace };
