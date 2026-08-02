'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { FC, ReactNode, useEffect } from 'react';
import { getLegacyCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
export const PHProvider: FC<{
  children: ReactNode;
  phkey?: string;
  host?: string;
}> = ({ children, phkey, host }) => {
  useEffect(() => {
    if (!phkey || !host) {
      return;
    }
    posthog.init(phkey, {
      api_host: host,
      person_profiles: 'identified_only',
      capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      persistence: 'localStorage',
      cross_subdomain_cookie: false,
    });

    const legacyDomain = getLegacyCookieUrlFromDomain(window.location.hostname);
    document.cookie = `ph_phc_${phkey}_posthog=; Path=/; Domain=${legacyDomain}; Max-Age=0; SameSite=Lax; Secure`;
  }, []);
  if (!phkey || !host) {
    return <>{children}</>;
  }
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
