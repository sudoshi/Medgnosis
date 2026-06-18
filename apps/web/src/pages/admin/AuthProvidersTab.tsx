import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api.js';
import { useToast } from '../../stores/ui.js';
import type { AuthProviderSetting } from './types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

function settingString(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === 'string' ? value : '';
}

function settingList(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ');
  return typeof value === 'string' ? value : '';
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AuthProvidersTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'auth-providers'],
    queryFn: () => api.get<{ providers: AuthProviderSetting[] }>('/admin/auth-providers'),
    staleTime: 30_000,
  });

  const oidc = data?.data?.providers.find((provider) => provider.provider_type === 'oidc');
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState('Authentik');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecretRef, setClientSecretRef] = useState('OIDC_CLIENT_SECRET');
  const [redirectUri, setRedirectUri] = useState('');
  const [scopes, setScopes] = useState('openid, profile, email, groups');
  const [allowedGroups, setAllowedGroups] = useState('Medgnosis Admins');
  const [adminGroups, setAdminGroups] = useState('Medgnosis Admins');

  useEffect(() => {
    if (!oidc) return;
    setEnabled(oidc.enabled);
    setLabel(settingString(oidc.settings, 'label') || oidc.display_name);
    setDiscoveryUrl(settingString(oidc.settings, 'discovery_url'));
    setClientId(settingString(oidc.settings, 'client_id'));
    setClientSecretRef(settingString(oidc.settings, 'client_secret_ref') || 'OIDC_CLIENT_SECRET');
    setRedirectUri(settingString(oidc.settings, 'redirect_uri'));
    setScopes(settingList(oidc.settings, 'scopes') || 'openid, profile, email, groups');
    setAllowedGroups(settingList(oidc.settings, 'allowed_groups') || 'Medgnosis Admins');
    setAdminGroups(settingList(oidc.settings, 'admin_groups') || 'Medgnosis Admins');
  }, [oidc]);

  const save = useMutation({
    mutationFn: () => api.patch('/admin/auth-providers/oidc', {
      display_name: label,
      enabled,
      settings: {
        label,
        discovery_url: discoveryUrl,
        client_id: clientId,
        client_secret_ref: clientSecretRef,
        redirect_uri: redirectUri,
        scopes: splitList(scopes),
        allowed_groups: splitList(allowedGroups),
        admin_groups: splitList(adminGroups),
      },
    }),
    onSuccess: () => {
      toast.success('Authentication provider saved');
      qc.invalidateQueries({ queryKey: ['admin', 'auth-providers'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save authentication provider')),
  });

  const test = useMutation({
    mutationFn: () => api.post('/admin/auth-providers/oidc/test'),
    onSuccess: () => toast.success('OIDC discovery check succeeded'),
    onError: (err) => toast.error(apiErrorMessage(err, 'OIDC discovery check failed')),
  });

  if (isLoading) {
    return <div className="surface p-6 text-sm text-ghost">Loading authentication providers...</div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-bright">Authentication Providers</h2>
          <p className="text-xs text-ghost mt-0.5">Local break-glass and Authentik OIDC configuration</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => test.mutate()} disabled={test.isPending}>
            <RefreshCw />
            Test
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save />
            Save
          </Button>
        </div>
      </div>

      <div className="surface p-5 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-edge/25 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-card bg-[var(--primary-bg)] text-[var(--primary)]">
              <KeyRound size={18} strokeWidth={1.7} />
            </div>
            <div>
              <p className="text-sm font-semibold text-bright">Authentik OIDC</p>
              <p className="text-xs text-ghost">medgnosis-oidc</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ghost">{enabled ? 'Enabled' : 'Disabled'}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable OIDC" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs text-dim">Label</span>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-dim">Client ID</span>
            <Input value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </label>
          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-xs text-dim">Discovery URL</span>
            <Input value={discoveryUrl} onChange={(event) => setDiscoveryUrl(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-dim">Client secret env var</span>
            <Input value={clientSecretRef} onChange={(event) => setClientSecretRef(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-dim">Redirect URI</span>
            <Input value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} />
          </label>
          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-xs text-dim">Scopes</span>
            <Textarea value={scopes} onChange={(event) => setScopes(event.target.value)} rows={2} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-dim">Allowed groups</span>
            <Textarea value={allowedGroups} onChange={(event) => setAllowedGroups(event.target.value)} rows={3} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-dim">Admin groups</span>
            <Textarea value={adminGroups} onChange={(event) => setAdminGroups(event.target.value)} rows={3} />
          </label>
        </div>

        <div className="flex items-center gap-2 rounded-card border border-emerald/20 bg-emerald/5 px-3 py-2 text-xs text-emerald">
          <ShieldCheck size={14} />
          OIDC group grants are capped at admin. Super-admin remains local only.
        </div>
      </div>
    </div>
  );
}
