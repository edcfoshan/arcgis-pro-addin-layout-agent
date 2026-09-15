// 两个断言原语。抛出的 Error 会被 run.mjs 捕获并计为该检查失败。
export const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

export const eq = (actual, expected, msg) =>
  ok(Object.is(actual, expected), `${msg} —— 期望 ${expected}，实际 ${actual}`);
