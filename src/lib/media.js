import heroHardwareImg from '../assets/images/hero_apple_laptop_1794671284406.jpg';
import proLaptopImg from '../assets/images/hw_pro_laptop_1794671285268.jpg';
import titaniumPhoneImg from '../assets/images/hw_titanium_phone_1794671285943.jpg';
import studioTabletImg from '../assets/images/hw_studio_tablet_1794671286312.jpg';
import studioHeadphonesImg from '../assets/images/hw_overear_headphones_1794671286352.jpg';
import titaniumWatchImg from '../assets/images/hw_titanium_watch_1794671287944.jpg';
import desktopDisplayImg from '../assets/images/hw_desktop_display_1794671287920.jpg';

export const HERO_IMAGE = heroHardwareImg;

export const PRODUCT_IMAGES = {
  'pro-laptop': proLaptopImg,
  'titanium-phone': titaniumPhoneImg,
  'studio-tablet': studioTabletImg,
  'studio-headphones': studioHeadphonesImg,
  'titanium-watch': titaniumWatchImg,
  'desktop-display': desktopDisplayImg,
};

export function formatPrice(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));
}

export function formatMonthly(paise) {
  const monthlyRupees = Math.round(paise / 1200);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monthlyRupees);
}

export function formatOrderDate(isoDate) {
  if (!isoDate) return '';
  const normalized = isoDate.includes('T') ? isoDate : isoDate.replace(' ', 'T') + 'Z';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}
