/**
 * Shared event model. Every module reads and writes this one shape, so a
 * change in one place (stage size, venue, lineup, guest forecast) can be
 * recomputed everywhere else by the engine.
 */
import type { CurrencyCode, FxRate } from '../engine/money';

export type ISO = string;
export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- provenance
export type VerificationStatus =
  | 'verified_authoritative'
  | 'verified_supplier'
  | 'user_confirmed_private'
  | 'third_party_unverified'
  | 'stale'
  | 'contradicted'
  | 'unavailable'
  | 'modeled'
  | 'illustrative'
  /** Returned by a provider API/open dataset: real record, not reviewed at the authoritative source. */
  | 'provider_reported';

export type SourceType =
  | 'official_venue_website'
  | 'official_venue_document'
  | 'venue_written_confirmation'
  | 'manufacturer_datasheet'
  | 'supplier_listing'
  | 'official_act_website'
  | 'agency_booking_page'
  | 'platform_help_page'
  | 'connected_account'
  | 'invoice'
  | 'user_entry'
  | 'specification_research_notes'
  | 'provider_api'
  | 'open_dataset';

export type ProviderId = 'ticketmaster' | 'osm_overpass' | 'osm_nominatim' | 'musicbrainz' | 'bank_of_canada';

export interface SourceEvidence {
  id: string;
  entityType: 'venue' | 'venue_config' | 'product' | 'offer' | 'act' | 'channel';
  entityId: string;
  fieldPath: string;
  assertedValue: string | number | null;
  unit?: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  publisher: string;
  retrievedAt: ISO;
  sourcePublishedAt?: ISO;
  validFrom?: ISO;
  validUntil?: ISO;
  rawDocumentHash?: string;
  extractionMethod: string;
  reviewerId?: string | null;
  verificationStatus: VerificationStatus;
  confidenceClass: 'high' | 'medium' | 'low' | 'none';
  usagePolicy: string;
  notes?: string;
  supersededBy?: string;
  /** Live-data envelope (spec LD §3.4). */
  providerId?: ProviderId;
  providerRecordId?: string;
  sourceFieldPath?: string;
  observedAt?: ISO;
  checkedAt?: ISO;
  expiresAt?: ISO;
  verificationMethod?: string;
  lastVerifiedBy?: string;
  rawPayloadHash?: string;
  currency?: string;
  conflictGroupId?: string;
}

export type GeometryFidelity = 'verified_dimensions' | 'partial_dimensions' | 'illustrative';

// ---------------------------------------------------------------- venues
export interface VenueConfiguration {
  id: string;
  name: string;
  kind: 'seated' | 'standing' | 'reception' | 'mixed';
  capacity: number | null;
  breakdown?: { label: string; count: number }[];
  evidenceIds: string[];
}

export interface PublishedRate {
  amountMinor: number;
  currency: CurrencyCode;
  basis: string;
  indicative: boolean;
  evidenceId: string;
}

export interface Venue {
  id: string;
  /** Present on venues saved from a provider search; seed venues have none. */
  provider?: { id: ProviderId; recordId: string; listingUrl: string | null; savedAt: ISO; attribution: string };
  organization: string;
  campus: string;
  space: string;
  market: string;
  locality: string;
  country: string;
  timezone: string;
  roomType: string;
  indoor: boolean;
  officialUrls: string[];
  bookingRoute: string;
  suitability: string[];
  configurations: VenueConfiguration[];
  stage: {
    widthM?: number;
    depthM?: number;
    prosceniumWidthM?: number;
    evidenceIds: string[];
  };
  publishedRates: PublishedRate[];
  features: string[];
  restrictions: string[];
  geometryFidelity: GeometryFidelity;
  unverifiedChecklist: string[];
}

// ---------------------------------------------------------------- scene
export type SceneLayer = 'structure' | 'stage' | 'audio' | 'lighting' | 'video' | 'seating' | 'service' | 'zone' | 'decor';
export type DimsSource = 'verified' | 'manufacturer_spec' | 'generic_proxy' | 'user_measured' | 'user_proposed' | 'visual_only';

export type SceneObjectKind =
  | 'stage_deck'
  | 'riser'
  | 'seat_block'
  | 'table_round'
  | 'mic_stand'
  | 'di_box'
  | 'speaker'
  | 'sub'
  | 'wedge'
  | 'mixer'
  | 'light_fixture'
  | 'truss'
  | 'screen'
  | 'projector'
  | 'podium'
  | 'bar'
  | 'merch'
  | 'checkin'
  | 'door'
  | 'column'
  | 'barrier'
  | 'zone'
  | 'generic';

export interface SeatBlockParams {
  rows: number;
  cols: number;
  seatPitchM: number; // centre-to-centre across a row
  rowPitchM: number; // centre-to-centre front-to-back
}

export interface SceneObject {
  id: string;
  kind: SceneObjectKind;
  label: string;
  layer: SceneLayer;
  /** Footprint centre on the floor plane (x, z) and base elevation (y), metres. */
  position: Vec3;
  /** Rotation about the vertical axis, radians. */
  rotationY: number;
  /** Width (x), height (y), depth (z) in metres. */
  size: Vec3;
  dimsSource: DimsSource;
  evidenceIds?: string[];
  productId?: string;
  locked?: boolean;
  hidden?: boolean;
  seat?: SeatBlockParams;
  /** Electrical/audio metadata from the spec sheet when known. */
  powerW?: number | null;
  peakPowerW?: number | null;
  inputs?: number;
  connector?: string;
  channel?: number | null;
  ownership?: Ownership;
  /** For zone objects: what the zone represents. */
  zoneType?: string;
}

export interface Scene {
  version: number;
  room: { widthM: number; depthM: number; heightM: number; source: DimsSource; note: string };
  objects: SceneObject[];
  assumptions: {
    stageFrontClearanceM: number;
    aisleClearanceM: number;
    doorClearanceM: number;
    seatedEyeHeightM: number;
    performerTargetHeightM: number;
    standingM2PerPerson: number;
  };
}

export interface SceneSnapshot {
  id: string;
  name: string;
  createdAt: ISO;
  scene: Scene;
  note?: string;
}

// ---------------------------------------------------------------- catalog
export type Ownership = 'venue_supplied' | 'organizer_owned' | 'rent' | 'buy';

export interface Product {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  category: SceneObjectKind;
  isGenericProxy: boolean;
  specUrl: string | null;
  sizeM: Vec3 | null; // null = unknown → cannot satisfy clearance tests
  dimsSource: DimsSource;
  weightKg: number | null;
  powerW: number | null;
  peakPowerW: number | null;
  inputs?: number;
  connector?: string;
  notes?: string;
  createdBy: 'seed' | 'user';
}

export interface PriceOffer {
  id: string;
  productId: string;
  vendor: string;
  vendorRegion: string;
  kind: 'buy' | 'rent';
  amountMinor: number | null; // null = request quote / unavailable — never 0
  currency: CurrencyCode;
  basis: 'per item' | 'per day' | 'per weekend' | 'per week' | 'package';
  minRentalDays?: number;
  exclusions: string;
  url: string | null;
  retrievedAt: ISO;
  validUntil?: ISO;
  lastChecked: ISO;
  status: VerificationStatus;
  privateQuote: boolean;
  priceUnavailableReason?: string;
}

// ---------------------------------------------------------------- talent
export interface TalentAct {
  id: string;
  stageName: string;
  actType: 'stand-up comedy' | 'solo musician' | 'band' | 'DJ' | 'speaker' | 'host/emcee' | 'magician' | 'dancer' | 'cultural' | 'specialty' | 'family';
  genres: string[];
  homeRegion: string;
  officialSiteUrl: string;
  bookingRoute: { type: 'agency_page' | 'contact_form' | 'business_email' | 'booking_phone'; value: string; representative?: string };
  sourceUrl: string;
  verifiedOn: ISO | null;
  lastChecked: ISO;
  status: VerificationStatus;
  notes?: string;
}

export interface LineupSlot {
  id: string;
  actId: string;
  sessionId: string;
  startLocal: string; // HH:MM in event timezone
  durationMin: number;
  role: 'headliner' | 'feature' | 'opener' | 'host' | 'support';
  inquiry: { state: 'not_contacted' | 'inquiry_sent' | 'responded' | 'offer_made' | 'contracted' | 'declined'; date?: ISO; notes?: string };
  feeMinor: number | null; // organizer-entered quote, private
  riderReceived: boolean;
}

// ---------------------------------------------------------------- campaign
export interface MarketingChannel {
  id: string;
  name: string;
  kind: 'paid_social' | 'search_video' | 'event_listing' | 'owned' | 'local_media';
  officialUrl: string;
  docsUrl?: string;
  regions: string;
  formats: string;
  pricingRule: string; // dated rule statement — never a fabricated cost
  ruleCheckedAt: ISO;
  integration: 'link-only' | 'import' | 'read' | 'write' | 'publish';
  caveat: string;
}

export interface CampaignLine {
  id: string;
  channelId: string;
  plannedMinor: number | null;
  committedMinor: number | null;
  invoicedMinor: number | null;
  observed: { impressions: number; clicks: number; conversions: number; spendMinor: number; revenueMinor: number; importedAt: ISO; source: string; rowKeys?: string[] } | null;
  utm: { source: string; medium: string; campaign: string; content?: string };
  landingUrl?: string;
  /** Optional explicit conversion model — only then may spend change the ticket forecast. */
  model: { cpcMinor: number; clickToTicketPct: number } | null;
  startDate?: string;
  endDate?: string;
}

// ---------------------------------------------------------------- service / staff
export interface GuestCohort {
  id: string;
  name: string;
  kind: 'general' | 'vip' | 'accessible' | 'comp' | 'staff' | 'talent' | 'media';
  projected: number;
  verified: number | null;
  arrivalWindowMin: number;
}

export interface StationAssumption {
  kind: 'bar' | 'merch' | 'checkin';
  servedPerHourPerStation: number;
  usageShare: number; // fraction of guests using it during the peak window
  staffPerStation: number;
}

export interface StaffShift {
  id: string;
  role: string;
  person: string;
  start: string;
  end: string;
  rateMinorPerHour: number | null;
  zone?: string;
}

export type SupplierCategory = 'caterer' | 'event_rental' | 'security' | 'staffing' | 'transport' | 'sanitation' | 'av_production';

/** A real business saved from a provider search. Existence is not availability, eligibility or vetting. */
export interface ServiceSupplier {
  id: string;
  name: string;
  category: SupplierCategory;
  provider: { id: ProviderId; recordId: string; attribution: string; savedAt: ISO } | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  evidenceIds: string[];
  notes?: string;
}

export interface SupplierAssignment {
  id: string;
  supplierId: string;
  role: string;
  status: 'proposed' | 'quote_requested' | 'quoted' | 'confirmed' | 'declined';
  /** Private quote. Only a confirmed quote with amount, currency and quantity becomes a priced cost line. */
  quote: { amountMinor: number | null; currency: string; quantity: number; basis: 'fixed' | 'per_attendee'; validUntil?: string; terms?: string; confirmed: boolean } | null;
  category: CostCategory;
}

/** A user-selected discovery result kept as a reference (shortlist / comparable / event research). */
export interface SavedReference {
  id: string;
  type: 'event' | 'venue' | 'performer' | 'service';
  providerId: ProviderId;
  providerRecordId: string;
  name: string;
  url: string | null;
  /** Minimal snapshot of the values seen at save time, for reproducibility. */
  snapshot: Record<string, string | number | null>;
  retrievedAt: ISO;
  savedAt: ISO;
  eventIds: string[];
  note?: string;
}

// ---------------------------------------------------------------- production
export interface ScheduleBlock {
  id: string;
  sessionId: string;
  kind: 'access' | 'load_in' | 'setup' | 'soundcheck' | 'rehearsal' | 'doors' | 'show' | 'interval' | 'service' | 'strike' | 'load_out' | 'curfew';
  label: string;
  start: string; // HH:MM
  end: string;
  dependsOn?: string[];
  owner?: string;
}

export interface Cue {
  id: string;
  number: string;
  label: string;
  plannedTime: string;
  actualTime?: string;
  operator: string;
  department: 'audio' | 'lighting' | 'video' | 'stage' | 'house';
  fallback?: string;
}

export interface Task {
  id: string;
  title: string;
  owner: string;
  due?: string;
  done: boolean;
  module: string;
}

export interface DocumentRef {
  id: string;
  title: string;
  kind: 'contract' | 'insurance' | 'permit' | 'rider' | 'safety' | 'site_map' | 'order' | 'invoice' | 'other';
  url: string;
  version: number;
  addedAt: ISO;
}

// ---------------------------------------------------------------- finance
export type CostCategory =
  | 'venue' | 'deposit' | 'staffing' | 'talent' | 'travel' | 'tax' | 'permits_insurance' | 'equipment'
  | 'delivery' | 'crew' | 'catering_bar' | 'marketing' | 'ticketing_fees' | 'merchandise'
  | 'contingency' | 'accessibility' | 'other';

export type CostBasis = 'fixed' | 'per_attendee' | 'per_ticket';
export type LineState = 'estimated' | 'quoted' | 'committed' | 'paid';

export interface BudgetLine {
  id: string;
  category: CostCategory;
  label: string;
  amountMinor: number | null;
  currency: CurrencyCode;
  basis: CostBasis;
  quantity: number;
  state: LineState;
  source: 'published' | 'private_quote' | 'assumption' | 'invoice' | 'derived';
  sourceNote?: string;
  /** Lines generated from other modules carry their origin so they are not double counted. */
  derivedFrom?: { module: 'catalog' | 'spotlight' | 'campaign' | 'service' | 'venue' | 'supplier'; refId: string };
}

export interface RevenueLine {
  id: string;
  kind: 'sponsor' | 'grant' | 'bar' | 'merch' | 'donation' | 'vendor_fee' | 'other';
  label: string;
  amountMinor: number | null;
  currency: CurrencyCode;
  state: 'assumption' | 'agreed' | 'received';
}

export interface TicketTier {
  id: string;
  name: string;
  priceMinor: number;
  /** Fixed quantity or null to take the remainder of sellable inventory. */
  quantity: number | null;
}

export interface FinanceAssumptions {
  sellThrough: { low: number; base: number; high: number }; // fractions 0–1
  ticketFeeBps: number; // organizer-absorbed platform + processing fee, % of face
  ticketFeeFixedMinor: number;
  refundBps: number;
  taxIncludedBps: number; // sales tax already inside face price
  contingencyBps: number;
  feeSourceNote: string;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: ISO;
  calcVersion: string;
  inputHash: string;
  inputs: unknown;
  result: unknown;
}

// ---------------------------------------------------------------- event
export type EventStatus =
  | 'draft' | 'researching' | 'planning' | 'pending_external_confirmation' | 'approved'
  | 'in_production' | 'live' | 'completed' | 'archived' | 'cancelled';

export interface AuditEvent {
  id: string;
  at: ISO;
  actor: string;
  action: string;
  detail: string;
  reason?: string;
}

export interface EventSession {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD in event timezone
  doors: string;
  show: string;
  curfew: string;
}

export interface ShowEvent {
  id: string;
  orgId: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  visibility: 'public' | 'private';
  status: EventStatus;
  timezone: string;
  currency: CurrencyCode;
  sessions: EventSession[];
  venueId: string | null;
  venueConfigId: string | null;
  venueBooking: { state: 'none' | 'inquiry' | 'hold' | 'tentative' | 'confirmed'; evidence?: string; updatedAt?: ISO };
  attendanceTarget: number | null;
  holds: { comps: number; accessible: number; production: number };
  scene: Scene;
  sceneSnapshots: SceneSnapshot[];
  ticketTiers: TicketTier[];
  budgetLines: BudgetLine[];
  revenueLines: RevenueLine[];
  assumptions: FinanceAssumptions;
  fxRates: FxRate[];
  lineup: LineupSlot[];
  procurement: { id: string; productId: string; offerId: string | null; quantity: number; ownership: Ownership; rentalDays: number }[];
  campaign: CampaignLine[];
  cohorts: GuestCohort[];
  stationAssumptions: StationAssumption[];
  staff: StaffShift[];
  supplierAssignments: SupplierAssignment[];
  schedule: ScheduleBlock[];
  cues: Cue[];
  tasks: Task[];
  documents: DocumentRef[];
  scenarios: ScenarioSnapshot[];
  audit: AuditEvent[];
  createdAt: ISO;
  updatedAt: ISO;
}
