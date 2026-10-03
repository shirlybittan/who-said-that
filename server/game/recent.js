// The last `n` distinct entries of a history list, judged by each entry's most
// recent use. `[...new Set(list)]` keeps FIRST occurrences, so a question used
// long ago and again just now looked old and could be picked again too soon.
function recentDistinct(list, n) {
  const seen = new Set();
  const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < n; i--) {
    if (!seen.has(list[i])) { seen.add(list[i]); out.push(list[i]); }
  }
  return out.reverse();
}

module.exports = { recentDistinct };
