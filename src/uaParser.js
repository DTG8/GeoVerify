/**
 * A lightweight, dependency-free utility to parse User-Agent strings.
 * Detects OS, Browser, and Device Type.
 */
export function parseUA(uaString) {
  if (!uaString) {
    return {
      os: 'Unknown',
      browser: 'Unknown',
      device: 'Desktop'
    };
  }

  let os = 'Unknown';
  let browser = 'Unknown';
  let device = 'Desktop';

  const ua = uaString.toLowerCase();

  // 1. Detect Device Type
  if (/ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle|opera mini/i.test(ua)) {
    device = 'Mobile';
  } else {
    device = 'Desktop';
  }

  // 2. Detect OS
  if (/windows/i.test(ua)) {
    os = 'Windows';
    if (/phone/i.test(ua)) os = 'Windows Phone';
  } else if (/macintosh|mac os x/i.test(ua)) {
    // iPad might report itself as Mac OS X on newer Safari
    if (device === 'Tablet' || (navigator && navigator.maxTouchPoints > 0)) {
      os = 'iOS';
    } else {
      os = 'macOS';
    }
  } else if (/iphone|ipod|ipad/i.test(ua)) {
    os = 'iOS';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  } else if (/cros/i.test(ua)) {
    os = 'Chrome OS';
  }

  // 3. Detect Browser
  if (/samsungbrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/opera|opr/i.test(ua)) {
    browser = 'Opera';
  } else if (/edge|edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/chrome|crios/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua)) {
    browser = 'Safari';
  } else if (/msie|trident/i.test(ua)) {
    browser = 'Internet Explorer';
  }

  return { os, browser, device };
}
