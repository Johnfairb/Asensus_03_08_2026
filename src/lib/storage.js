export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function lsGetJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (e) {
    return fallback;
  }
}

export function lsSet(key, value) {
  localStorage.setItem(key, value);
}

export function lsSetJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
