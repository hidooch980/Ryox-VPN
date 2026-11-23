export type Language = 'en' | 'fa';

export const translations = {
  en: {
    // Brand & App
    appName: 'RYOX VPN',
    tagline: '100% Free & Open Source',
    version: 'v1.0.0',
    freeForeverPledge: 'Our Perpetual Manifesto: 100% Free Forever',

    // Connection States
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING...',
    VERIFYING: 'VERIFYING TUNNEL...',
    CONNECTED: 'CONNECTED',
    DISCONNECTING: 'DISCONNECTING...',
    ERROR: 'CONNECTION ERROR',

    // Buttons & Actions
    clickToConnect: 'CLICK TO CONNECT',
    disconnect: 'DISCONNECT',
    protectedEncrypted: 'Protected & Encrypted',
    encryptedMultiCore: 'Encrypted with Multi-Core',
    addNode: 'Add Node',
    pingAll: 'Ping All',
    testingLatency: 'Testing Latency...',
    syncNow: 'Sync Now',
    updating: 'Updating...',
    fetchFreeServers: 'Fetch & Sync Free Servers',
    saveSettings: 'Save Settings',
    runDiagnostics: 'Run Diagnostics',
    copy: 'Copy',
    copied: 'Copied',
    cancel: 'Cancel',

    // Navigation
    dashboard: 'Dashboard',
    servers: 'Servers',
    subscriptions: 'Subscriptions',
    freeSources: 'Free Sources',
    coreManager: 'Core Manager',
    protocolManager: 'Protocols',
    configEditor: 'Config Editor',
    routing: 'Routing Rules',
    dns: 'DNS Settings',
    splitTunneling: 'Split Tunneling',
    diagnostics: 'Diagnostics',
    logs: 'Live Logs',
    appUpdates: 'App Updates',
    coreUpdates: 'Core Updates',
    appearance: 'Appearance',
    settings: 'Settings',
    about: 'About Ryox',

    // Metrics
    download: 'DOWNLOAD',
    upload: 'UPLOAD',
    totalData: 'TOTAL DATA',
    duration: 'DURATION',
    virtualIp: 'Virtual IP',
    tunnelLatency: 'Tunnel Latency',
    activeEngine: 'ACTIVE ENGINE',
    selectedNode: 'SELECTED NODE',
    liveThroughput: 'Live Throughput',

    // Language switcher
    language: 'Language / زبان',
    english: 'English',
    persian: 'فارسی (Persian)'
  },
  fa: {
    // Brand & App
    appName: 'ریوکس وی‌پی‌ان',
    tagline: '۱۰۰٪ رایگان و متن‌باز',
    version: 'نسخه ۱.۰.۰',
    freeForeverPledge: 'مرام‌نامه همیشگی: ۱۰۰٪ رایگان برای همیشه',

    // Connection States
    DISCONNECTED: 'قطع شده',
    CONNECTING: 'در حال اتصال...',
    VERIFYING: 'تأیید تونل رمزنگاری...',
    CONNECTED: 'متصل شد',
    DISCONNECTING: 'در حال قطع اتصال...',
    ERROR: 'خطا در برقراری ارتباط',

    // Buttons & Actions
    clickToConnect: 'برای اتصال کلیک کنید',
    disconnect: 'قطع اتصال',
    protectedEncrypted: 'ایمن و رمزنگاری شده',
    encryptedMultiCore: 'رمزنگاری چند هسته‌ای فعال',
    addNode: 'افزودن سرور',
    pingAll: 'تست پینگ همه',
    testingLatency: 'در حال بررسی تاخیر...',
    syncNow: 'بروزرسانی اکنون',
    updating: 'در حال دریافت...',
    fetchFreeServers: 'دریافت سرورهای رایگان عمومی',
    saveSettings: 'ذخیره تنظیمات',
    runDiagnostics: 'اجرای عیب‌یابی شبکه',
    copy: 'کپی',
    copied: 'کپی شد',
    cancel: 'انصراف',

    // Navigation
    dashboard: 'داشبورد اصلی',
    servers: 'سرورها و نودها',
    subscriptions: 'مدیریت اشتراک‌ها',
    freeSources: 'منابع رایگان عمومی',
    coreManager: 'مدیریت هسته‌ها',
    protocolManager: 'پروتکل‌ها',
    configEditor: 'ویرایشگر کانفیگ',
    routing: 'قوانین روتینگ',
    dns: 'تنظیمات DNS',
    splitTunneling: 'تونلینگ تفکیکی',
    diagnostics: 'عیب‌یابی شبکه',
    logs: 'لاگ‌های زنده',
    appUpdates: 'بروزرسانی برنامه',
    coreUpdates: 'بروزرسانی هسته‌ها',
    appearance: 'شخصی‌سازی ظاهری',
    settings: 'تنظیمات عمومی',
    about: 'درباره ریوکس',

    // Metrics
    download: 'سرعت دانلود',
    upload: 'سرعت آپلود',
    totalData: 'کل ترافیک مصرفی',
    duration: 'مدت زمان اتصال',
    virtualIp: 'آی‌پی مجازی شما',
    tunnelLatency: 'تاخیر پینگ تونل',
    activeEngine: 'هسته فعال',
    selectedNode: 'نود انتخاب شده',
    liveThroughput: 'نمودار زنده پهنای باند',

    // Language switcher
    language: 'زبان / Language',
    english: 'English (انگلیسی)',
    persian: 'فارسی (Persian)'
  }
};

export const getTranslation = (lang: Language = 'en') => {
  return translations[lang] || translations.en;
};
