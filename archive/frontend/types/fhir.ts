export interface FHIRDocumentReference {
  resourceType: "DocumentReference";
  status: "current" | "superseded" | "entered-in-error";
  type: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject: {
    reference: string;
  };
  date: string;
  content: Array<{
    attachment: {
      contentType: string;
      data: string;
    };
  }>;
  context?: {
    encounter?: Array<{
      reference: string;
    }>;
    period?: {
      start: string;
      end?: string;
    };
  };
}
