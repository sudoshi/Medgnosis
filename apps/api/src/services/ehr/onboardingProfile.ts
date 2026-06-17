import { buildPatientLaunchScopes } from './scopePolicy.js';
import type {
  EhrClientApprovalStatus,
  EhrClientAuthMethod,
  EhrEnvironment,
  EhrVendor,
} from './tenantRegistry.js';
import { getVendorAdapter } from './vendorAdapters/index.js';

export interface EhrOnboardingProfileInput {
  vendor: EhrVendor;
  environment?: EhrEnvironment;
  name?: string;
  fhirBaseUrl: string;
  apiBaseUrl?: string;
  tenantId?: number;
  orgId?: number | null;
  status?: string;
  smartClientId?: string;
  backendClientId?: string;
  cdsClientId?: string;
}

export interface EhrOnboardingProfile {
  profile: {
    id: string;
    version: string;
  };
  tenant: {
    vendor: EhrVendor;
    vendorDisplayName: string;
    environment: EhrEnvironment;
    name: string;
    fhirBaseUrl: string;
    smartConfigUrl: string;
    audience: string;
    orgId: number | null;
    status: string;
  };
  endpoints: {
    apiBaseUrl?: string;
    smartConfigurationUrl: string;
    capabilityStatementUrl: string;
    smartLaunchUrl?: string;
    smartRedirectUris: string[];
    backendJwksUrl?: string;
    cdsServicesUrl?: string;
  };
  scopes: {
    ehrLaunch: string[];
    standaloneLaunch: string[];
    backendServices: string[];
    cdsHooks: string[];
  };
  clientRegistrations: {
    smartLaunch: {
      clientType: 'smart_launch';
      clientSlot: string;
      authMethod: EhrClientAuthMethod;
      clientId: string;
      profileId: string;
      profileVersion: string;
      portalAppId: string | null;
      approvalStatus: EhrClientApprovalStatus;
      launchUrl?: string;
      redirectUris: string[];
      scopesRequested: string;
      notes: string[];
    };
    backendServices: {
      clientType: 'backend_services';
      clientSlot: string;
      authMethod: EhrClientAuthMethod;
      clientId: string;
      profileId: string;
      profileVersion: string;
      portalAppId: string | null;
      approvalStatus: EhrClientApprovalStatus;
      jwksUrl?: string;
      privateKeyRef: string;
      scopesRequested: string;
      notes: string[];
    };
    cdsHooks: {
      clientType: 'cds_hooks';
      clientSlot: string;
      authMethod: EhrClientAuthMethod;
      clientId: string;
      profileId: string;
      profileVersion: string;
      portalAppId: string | null;
      approvalStatus: EhrClientApprovalStatus;
      endpointUrl?: string;
      scopesRequested: string;
      notes: string[];
    };
  };
  vendorChecklist: string[];
  smokeTests: string[];
  commands: {
    keygen: string;
    onboard: string;
    smoke: string;
  };
}

const DEFAULT_API_BASE_URL = 'https://api.medgnosis.example';
const DEFAULT_BACKEND_PRIVATE_KEY_REF = 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384';
const PROFILE_VERSION = '2026-06-17';

export function buildEhrOnboardingProfile(input: EhrOnboardingProfileInput): EhrOnboardingProfile {
  const environment = input.environment ?? 'sandbox';
  const fhirBaseUrl = trimTrailingSlash(input.fhirBaseUrl);
  const apiBaseUrl = input.apiBaseUrl ? trimTrailingSlash(input.apiBaseUrl) : undefined;
  const publicBaseUrl = apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const adapter = getVendorAdapter(input.vendor);
  const discovery = adapter.discover({ vendor: input.vendor, fhirBaseUrl });
  const profileId = `${input.vendor}-smart-r4`;
  const vendorDisplayName = displayNameForVendor(adapter.displayName);
  const tenantName = input.name?.trim() || `${vendorDisplayName} ${titleCase(environment)}`;
  const tenantIdSegment = input.tenantId ? String(input.tenantId) : '{tenant_id}';
  const smartLaunchUrl = `${publicBaseUrl}/api/v1/ehr/launch/${tenantIdSegment}`;
  const smartRedirectUris = [`${publicBaseUrl}/api/v1/ehr/launch/callback`];
  const backendJwksUrl = `${publicBaseUrl}/.well-known/jwks.json`;
  const cdsServicesUrl = `${publicBaseUrl}/cds-services`;
  const ehrLaunchScopes = adapter.defaultScopes({ mode: 'patient', launchMode: 'ehr' });
  const standaloneLaunchScopes = adapter.defaultScopes({ mode: 'patient', launchMode: 'standalone' });
  const backendScopes = adapter.defaultScopes({ mode: 'backend' });
  const cdsScopes = buildCdsHookScopes();
  const profile: EhrOnboardingProfile = {
    profile: {
      id: profileId,
      version: PROFILE_VERSION,
    },
    tenant: {
      vendor: input.vendor,
      vendorDisplayName,
      environment,
      name: tenantName,
      fhirBaseUrl,
      smartConfigUrl: discovery.smartConfigurationUrl,
      audience: fhirBaseUrl,
      orgId: input.orgId ?? null,
      status: input.status ?? 'testing',
    },
    endpoints: {
      apiBaseUrl,
      smartConfigurationUrl: discovery.smartConfigurationUrl,
      capabilityStatementUrl: discovery.capabilityStatementUrl,
      smartLaunchUrl,
      smartRedirectUris,
      backendJwksUrl,
      cdsServicesUrl,
    },
    scopes: {
      ehrLaunch: ehrLaunchScopes,
      standaloneLaunch: standaloneLaunchScopes,
      backendServices: backendScopes,
      cdsHooks: cdsScopes,
    },
    clientRegistrations: {
      smartLaunch: {
        clientType: 'smart_launch',
        clientSlot: 'smart_launch',
        authMethod: 'public_pkce',
        clientId: input.smartClientId ?? '<SMART_LAUNCH_CLIENT_ID>',
        profileId,
        profileVersion: PROFILE_VERSION,
        portalAppId: null,
        approvalStatus: 'draft',
        launchUrl: smartLaunchUrl,
        redirectUris: smartRedirectUris,
        scopesRequested: ehrLaunchScopes.join(' '),
        notes: [
          'Use the EHR launch URL for embedded launch configuration.',
          'Use the redirect URI for the authorization-code callback.',
          'Enable PKCE S256 for public SMART launch clients.',
        ],
      },
      backendServices: {
        clientType: 'backend_services',
        clientSlot: 'backend_services',
        authMethod: 'private_key_jwt',
        clientId: input.backendClientId ?? '<BACKEND_SERVICES_CLIENT_ID>',
        profileId,
        profileVersion: PROFILE_VERSION,
        portalAppId: null,
        approvalStatus: 'draft',
        jwksUrl: backendJwksUrl,
        privateKeyRef: DEFAULT_BACKEND_PRIVATE_KEY_REF,
        scopesRequested: backendScopes.join(' '),
        notes: [
          'Generate a signing key with npm run ehr:keygen and publish only the public JWKS URL to the EHR.',
          'Store private key material in an environment or secret-manager ref, never in the database.',
          'Request only approved system scopes for scheduled ingestion and quality workflows.',
        ],
      },
      cdsHooks: {
        clientType: 'cds_hooks',
        clientSlot: 'cds_hooks',
        authMethod: 'fhir_authorization_jwt',
        clientId: input.cdsClientId ?? '<CDS_HOOKS_CLIENT_ID>',
        profileId,
        profileVersion: PROFILE_VERSION,
        portalAppId: null,
        approvalStatus: 'draft',
        endpointUrl: cdsServicesUrl,
        scopesRequested: cdsScopes.join(' '),
        notes: [
          'Expose GET /cds-services as public discovery.',
          'Protect POST /cds-services/{id} with CDS Hooks fhirAuthorization JWT validation in production.',
          'Keep feedback enabled for alert-burden monitoring and suppression governance.',
        ],
      },
    },
    vendorChecklist: vendorChecklist(input.vendor),
    smokeTests: [
      'Run SMART discovery and CapabilityStatement diagnostics before app registration submission.',
      'After SMART client IDs are issued, run npm run ehr:onboard -- --run-smoke.',
      'Enable backend token exchange smoke only after private_key_jwt credentials and JWKS hosting are configured.',
      'Run an authenticated FHIR read smoke with a test patient token before production activation.',
    ],
    commands: {
      keygen: 'npm run ehr:keygen -- --kid backend-key-1',
      onboard: buildOnboardCommand({
        vendor: input.vendor,
        environment,
        name: tenantName,
        fhirBaseUrl,
        apiBaseUrl: publicBaseUrl,
        smartClientId: input.smartClientId ?? '<SMART_LAUNCH_CLIENT_ID>',
        backendClientId: input.backendClientId ?? '<BACKEND_SERVICES_CLIENT_ID>',
        cdsClientId: input.cdsClientId ?? '<CDS_HOOKS_CLIENT_ID>',
      }),
      smoke: buildSmokeCommand(input.tenantId),
    },
  };

  return profile;
}

export function formatEhrOnboardingProfile(profile: EhrOnboardingProfile): string {
  const lines = [
    `EHR onboarding profile: ${profile.tenant.name}`,
    `Profile: ${profile.profile.id}@${profile.profile.version}`,
    `Vendor/environment: ${profile.tenant.vendorDisplayName} / ${profile.tenant.environment}`,
    `FHIR base URL: ${profile.tenant.fhirBaseUrl}`,
    `SMART configuration: ${profile.endpoints.smartConfigurationUrl}`,
    `CapabilityStatement: ${profile.endpoints.capabilityStatementUrl}`,
    '',
    'SMART launch registration:',
    `  client_slot: ${profile.clientRegistrations.smartLaunch.clientSlot}`,
    `  auth_method: ${profile.clientRegistrations.smartLaunch.authMethod}`,
    `  client_id: ${profile.clientRegistrations.smartLaunch.clientId}`,
    `  approval_status: ${profile.clientRegistrations.smartLaunch.approvalStatus}`,
    `  launch_url: ${profile.clientRegistrations.smartLaunch.launchUrl}`,
    `  redirect_uris: ${profile.clientRegistrations.smartLaunch.redirectUris.join(', ')}`,
    `  scopes: ${profile.clientRegistrations.smartLaunch.scopesRequested}`,
    '',
    'Backend Services registration:',
    `  client_slot: ${profile.clientRegistrations.backendServices.clientSlot}`,
    `  auth_method: ${profile.clientRegistrations.backendServices.authMethod}`,
    `  client_id: ${profile.clientRegistrations.backendServices.clientId}`,
    `  approval_status: ${profile.clientRegistrations.backendServices.approvalStatus}`,
    `  jwks_url: ${profile.clientRegistrations.backendServices.jwksUrl}`,
    `  private_key_ref: ${profile.clientRegistrations.backendServices.privateKeyRef}`,
    `  scopes: ${profile.clientRegistrations.backendServices.scopesRequested}`,
    '',
    'CDS Hooks registration:',
    `  client_slot: ${profile.clientRegistrations.cdsHooks.clientSlot}`,
    `  auth_method: ${profile.clientRegistrations.cdsHooks.authMethod}`,
    `  client_id: ${profile.clientRegistrations.cdsHooks.clientId}`,
    `  approval_status: ${profile.clientRegistrations.cdsHooks.approvalStatus}`,
    `  endpoint_url: ${profile.clientRegistrations.cdsHooks.endpointUrl}`,
    `  scopes: ${profile.clientRegistrations.cdsHooks.scopesRequested || '(JWT fhirAuthorization)'}`,
    '',
    'Vendor checklist:',
    ...profile.vendorChecklist.map((item) => `  - ${item}`),
    '',
    'Commands:',
    `  ${profile.commands.keygen}`,
    `  ${profile.commands.onboard}`,
    `  ${profile.commands.smoke}`,
  ];

  return lines.join('\n');
}

function buildCdsHookScopes(): string[] {
  return buildPatientLaunchScopes({
    resources: ['Patient', 'Encounter', 'Condition', 'Observation', 'MedicationRequest'],
    additionalScopes: ['user/Practitioner.r'],
  });
}

function buildOnboardCommand(input: {
  vendor: EhrVendor;
  environment: EhrEnvironment;
  name: string;
  fhirBaseUrl: string;
  apiBaseUrl: string;
  smartClientId: string;
  backendClientId: string;
  cdsClientId: string;
}): string {
  const args = [
    'npm',
    'run',
    'ehr:onboard',
    '--',
    '--vendor',
    input.vendor,
    '--environment',
    input.environment,
    '--name',
    input.name,
    '--fhir-base-url',
    input.fhirBaseUrl,
    '--api-base-url',
    input.apiBaseUrl,
    '--smart-client-id',
    input.smartClientId,
    '--backend-client-id',
    input.backendClientId,
    '--backend-private-key-ref',
    DEFAULT_BACKEND_PRIVATE_KEY_REF,
    '--cds-client-id',
    input.cdsClientId,
    '--run-smoke',
  ];

  return args.map(shellArg).join(' ');
}

function buildSmokeCommand(tenantId: number | undefined): string {
  const tenant = tenantId ? String(tenantId) : '{tenant_id}';
  return `npm run ehr:smoke -- --tenant-id ${shellArg(tenant)}`;
}

function vendorChecklist(vendor: EhrVendor): string[] {
  const common = [
    'Confirm customer security review, BAA/contract scope, and test-patient policy.',
    'Submit SMART launch redirect URI, launch URL, requested scopes, and privacy policy/support contacts.',
    'Register Backend Services as a separate system client with JWKS URL and least-privilege system scopes.',
    'Register CDS Hooks endpoint and confirm whether fhirAuthorization JWTs are required for service POSTs.',
    'Capture sandbox test users, patients, encounters, rate limits, and escalation contacts.',
  ];

  if (vendor === 'epic') {
    return [
      ...common,
      'Validate Epic customer tenant activation separately from public sandbox testing.',
      'Confirm launch context includes patient and encounter before enabling encounter-scoped workflows.',
      'Request Bulk Data group export approval only for bounded population and quality workloads.',
    ];
  }
  if (vendor === 'oracle_cerner') {
    return [
      ...common,
      'Confirm Oracle Health Millennium tenant, domain, and Code Console app registration details.',
      'Validate persona-specific scope grants because insufficient-scope errors can vary by user context.',
      'Confirm patient and group Bulk Data export permissions before scheduling population jobs.',
    ];
  }
  if (vendor === 'hapi') {
    return [
      ...common,
      'Confirm the SMART authorization server, issuer, and token endpoint are configured for the FHIR base URL.',
      'Validate CapabilityStatement resource support because HAPI/Smile deployments vary by module.',
    ];
  }
  if (vendor === 'other') {
    return [
      ...common,
      'Document any non-FHIR or interface-engine feeds and map them into the same tenant registry.',
      'Require a sandbox replay plan before enabling production HL7 v2 or flat-file ingestion.',
    ];
  }
  return common;
}

function displayNameForVendor(adapterDisplayName: string): string {
  return adapterDisplayName;
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
