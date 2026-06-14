export { SolrClient } from './client.js';
export type { SolrConfig, SolrQueryParams, SolrResponse, SolrUpdateResponse } from './client.js';
export { buildSearchCoreQuery } from './query/search-query.js';
export type { SearchCoreQueryOptions } from './query/search-query.js';
export { buildClinicalCoreQuery, buildObservationCohortQuery } from './query/clinical-query.js';
export type {
  ClinicalCoreQueryOptions,
  ClinicalDocType,
  ObservationCohortQueryOptions,
} from './query/clinical-query.js';
export { reindexObservations, reindexEcqmObservations } from './indexers/observations.js';
