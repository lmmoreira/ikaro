import { useEffect, useState } from 'react';
import { PlatformErrorCode } from '@ikaro/types';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { fetchLeadFormConfigClient } from '@/features/platform/hotsite/api/lead-form';
import { extractProblemDetailShape } from '@/shared/lib/api/errors';

// The form's configuration: `undefined` while loading, `null` once the load failed.
function useLeadFormConfig(slug: string) {
  const [config, setConfig] = useState<HotsiteLeadFormConfigResponse | null | undefined>(undefined);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetchLeadFormConfigClient(slug)
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        // The server-rendered page already checks the manifest's LEAD_FORM module state, but an
        // ISR-cached page can still be stale by the time this live client fetch runs — the
        // module may have been disabled in between. Route that specific case to the same
        // <Unavailable/> the server-side check renders, not the generic submission-error card.
        if (extractProblemDetailShape(err)?.code === PlatformErrorCode.LEAD_FORM_NOT_ENABLED) {
          setModuleUnavailable(true);
          return;
        }
        setConfig(null);
      });
    return () => {
      active = false;
    };
    // requestVersion has no value of its own — bumping it (the terminal card's retry) is the only
    // way to re-run this effect and fetch again after a config-fetch failure, since the effect
    // otherwise only depends on slug, which never changes for a mounted retry. Without it a retry
    // cleared the config and stayed on the loading skeleton forever, since nothing re-ran the fetch.
  }, [slug, requestVersion]);

  function retry(): void {
    setConfig(undefined);
    setRequestVersion((version) => version + 1);
  }

  return { config, moduleUnavailable, retry };
}

// The signed-in customer's profile: `undefined` while loading, `null` for a guest or a failed load.
function useLeadFormProfile(slug: string) {
  const [customerProfile, setCustomerProfile] = useState<
    CustomerProfileResponse | null | undefined
  >(undefined);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile(slug)
      .then((profile) => {
        if (active) setCustomerProfile(profile);
      })
      .catch(() => {
        if (active) setCustomerProfile(null);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return customerProfile;
}

// What the lead form needs from the server before it can render: its configuration and, for a
// signed-in customer, the profile that prefills it.
export function useLeadFormData(slug: string) {
  const { config, moduleUnavailable, retry } = useLeadFormConfig(slug);
  const customerProfile = useLeadFormProfile(slug);

  return { config, customerProfile, moduleUnavailable, retryConfig: retry };
}
