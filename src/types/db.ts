// Hand-written type stubs that mirror the Supabase schema in supabase/migrations/.
// Run `supabase gen types typescript --linked > src/types/db.ts` once the project is
// linked to replace these with auto-generated types.
//
// IMPORTANT: Every table entry MUST include `Relationships: []` (even if empty).
// @supabase/supabase-js enforces `GenericSchema`, which requires
// `Tables: Record<string, GenericTable>` and `GenericTable` requires `Relationships`.
// Without it, the schema type falls back to `never` and all table operations
// become untyped `never`.

export type UserRole = 'owner' | 'accountant' | 'worker';
export type ProjectStatus = 'active' | 'archived';
// 'pending_review' = arrived via scan-to-email inbound and awaits the accountant's
// approval before it counts (distinct from 'processing', which is mid-extraction).
// Phase 1b adds submitted/changes_requested/rejected. They are only reachable
// when companies.approval_flow_enabled is true; 'confirmed' remains the only
// status counted in official totals.
export type ReceiptStatus =
  | 'processing' | 'confirmed' | 'duplicate' | 'error' | 'pending_review'
  | 'submitted' | 'changes_requested' | 'rejected';
export type InvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'disputed';
export type InviteRole = Exclude<UserRole, 'owner'>; // owner is fixed at signup only

// ─── Row types ─────────────────────────────────────────────────────────────────

export type Company = {
  id: string;
  name: string;
  hq_location: string;
  sector: string | null;
  logo_url: string | null;
  currency: string;
  created_at: string;
  // Scan-to-email: the company's unique inbound mailbox token (local part of the
  // <token>@scan.risip.co address) and the printer address allowed to send to it.
  scanner_inbox_token: string;
  scanner_sender_email: string | null;
  /** Phase 1b approval lifecycle. Off means current behaviour, unchanged. */
  approval_flow_enabled: boolean;
  /** One-person companies may approve their own submissions; always audited. */
  allow_self_approval: boolean;
  /** Reversal & correction of booked petty cash. Off means booked stays frozen. */
  reversal_enabled: boolean;
  /** The richer payout UI: method, reference, note. Paying works either way. */
  payouts_enabled: boolean;
};

export type Profile = {
  id: string;
  company_id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  deactivated_at: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  company_id: string;
  name: string;
  site_location: string | null;
  client_name: string | null;
  start_date: string | null;
  description: string | null;
  status: ProjectStatus;
  petty_cash_budget: number;
  created_by: string;
  created_at: string;
};

export type ProjectMemberRole = 'member' | 'leader';

export type ProjectMember = {
  project_id: string;
  profile_id: string;
  role: ProjectMemberRole;
};

export type InviteLink = {
  id: string;
  project_id: string;
  role: InviteRole;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

export type PaymentMethod = 'cash_personal' | 'petty_cash' | 'company_card';
export type PettyCashTxnType = 'allocation' | 'expense' | 'adjustment';
export type PettyCashTransactionStatus = 'pending' | 'accepted' | 'declined';

export type PettyCashAccount = {
  id: string;
  company_id: string;
  user_id: string;
  current_balance: number;
  created_at: string;
  updated_at: string;
};

export type PettyCashTransaction = {
  id: string;
  account_id: string;
  amount: number;
  type: PettyCashTxnType;
  receipt_id: string | null;
  project_id: string | null;
  description: string | null;
  created_by: string;
  status: PettyCashTransactionStatus;
  responded_at: string | null;
  created_at: string;
  // ── Reversal (migration 0062) ────────────────────────────────────────────
  // A posting's money is never rewritten. On the compensating adjustment,
  // reverses_transaction_id names the expense it undoes; on that expense,
  // reversed_at is the void marker. "One live expense per receipt" is a partial
  // unique index over (receipt_id) where reversed_at is null.
  /** Set on the adjustment: the expense row it undoes. */
  reverses_transaction_id: string | null;
  /** Required whenever reverses_transaction_id is set; at least 10 characters. */
  reversal_reason: string | null;
  /** Set on the original expense once it has been reversed. Written once. */
  reversed_at: string | null;
  reversed_by_transaction_id: string | null;
};

// Settlement, not expense. The expense counted when the receipt was confirmed;
// a payout records the company handing that money back to the employee.
export type ReimbursementPayoutMethod = 'cash' | 'mobile_money' | 'bank' | 'other';

export type ReimbursementPayout = {
  id: string;
  company_id: string;
  /** The employee being paid back. */
  paid_to: string;
  /** The finance user who paid them. */
  paid_by: string;
  paid_at: string;
  total_amount: number;
  method: ReimbursementPayoutMethod | null;
  reference: string | null;
  note: string | null;
  /** A payout is never deleted; a mistake is voided and stays visible. */
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
};

export type ReimbursementPayoutItem = {
  id: string;
  payout_id: string;
  receipt_id: string;
  /** What was actually paid. Frozen: a later edit to the receipt cannot move it. */
  amount_paid: number;
  voided_at: string | null;
  created_at: string;
};

export type Receipt = {
  id: string;
  /** Null until someone chooses a project. See migration 0046. */
  project_id: string | null;
  company_id: string;
  uploaded_by: string;
  image_url: string | null;
  vendor_name: string | null;
  vendor_tin: string | null;
  vendor_vrn: string | null;
  receipt_number: string | null;
  verification_code: string | null;
  receipt_date: string | null;
  receipt_time: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  category: string | null;
  status: ReceiptStatus;
  duplicate_of: string | null;
  /** Confirmed payment source. Null until a human confirms it (see 0049). */
  payment_method: PaymentMethod | null;
  /** Proposal only, e.g. parsed from a WhatsApp caption. Never authoritative. */
  payment_method_suggested: PaymentMethod | null;
  payment_method_reason: string | null;
  scanned_doc_id: string | null;
  raw_ai_response: unknown;
  low_confidence_fields: string[];
  created_at: string;
  /** Set once finance pays the uploader back for a cash_personal receipt. */
  reimbursed_at: string | null;
  reimbursed_by: string | null;
  /** Which channel the receipt arrived through. */
  source: ReceiptSource;
  /** False until a human has chosen project, category and payment source. */
  details_confirmed: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  /** Required when finance requests changes or rejects. */
  decision_reason: string | null;
};

export type ReceiptSource = 'web' | 'batch' | 'inbound_email' | 'whatsapp';

export type ReceiptAlias = {
  id: string;
  receipt_id: string;
  user_id: string;
  nickname: string;
  created_at: string;
  updated_at: string;
};

export type MerchantMemory = {
  id: string;
  company_id: string;
  match_key: string;
  vendor_name: string;
  vendor_tin: string | null;
  vendor_vrn: string | null;
  category: string | null;
  learned_from_receipt_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScannedDocument = {
  id: string;
  company_id: string;
  project_id: string;
  file_url: string;
  created_by: string;
  created_at: string;
};

export type Invoice = {
  id: string;
  project_id: string;
  company_id: string | null;
  period_start: string;
  period_end: string;
  total_amount: number;
  tax_amount: number;
  pdf_url: string | null;
  status: InvoiceStatus;
  generated_by: string;
  created_at: string;
  invoice_number: string | null;
  client_name: string | null;
  custom_notes: string | null;
  signature_url: string | null;
  public_token: string;
  line_items: InvoiceLineItem[] | null;
  signed_by: string | null;
  signed_at: string | null;
  sent_at: string | null;
};

// A line item groups the receipts of one category. `excludedReceiptIds` lets the
// accountant drop specific receipts from the invoice without deleting the receipt.
export type InvoiceLineItem = {
  category: string;
  description: string;
  receiptIds: string[];
};

export type InvoiceReceipt = {
  invoice_id: string;
  receipt_id: string;
};

export type AppNotification = {
  id: string;
  company_id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string | null;
  metadata: unknown;
  read_at: string | null;
  created_at: string;
};

// ─── Database shape for the typed Supabase client ──────────────────────────────
// supabase-js requires the schema to satisfy GenericSchema (Tables, Views, Functions).
// GenericTable requires Row, Insert, Update, AND Relationships (even if empty []).

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Partial<Company> & { name: string; hq_location: string };
        Update: Partial<Company>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; company_id: string; full_name: string; role: UserRole };
        Update: Partial<Profile>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Partial<Project> & { company_id: string; name: string; created_by: string };
        Update: Partial<Project>;
        Relationships: [];
      };
      project_members: {
        Row: ProjectMember;
        Insert: Partial<ProjectMember> & { project_id: string; profile_id: string };
        Update: Partial<ProjectMember>;
        Relationships: [];
      };
      invite_links: {
        Row: InviteLink;
        Insert: Partial<InviteLink> & {
          project_id: string;
          role: InviteRole;
          token: string;
          created_by: string;
        };
        Update: Partial<InviteLink>;
        Relationships: [];
      };
      receipts: {
        Row: Receipt;
        Insert: Partial<Receipt> & {
          project_id: string;
          company_id: string;
          uploaded_by: string;
          image_url?: string | null;
          status: ReceiptStatus;
        };
        Update: Partial<Receipt>;
        Relationships: [];
      };
      receipt_aliases: {
        Row: ReceiptAlias;
        Insert: Partial<ReceiptAlias> & { receipt_id: string; user_id: string; nickname: string };
        Update: Partial<ReceiptAlias>;
        Relationships: [];
      };
      merchant_memory: {
        Row: MerchantMemory;
        Insert: Partial<MerchantMemory> & {
          company_id: string;
          match_key: string;
          vendor_name: string;
          created_by: string;
        };
        Update: Partial<MerchantMemory>;
        Relationships: [];
      };
      // Written only by create_reimbursement_payout / void_reimbursement_payout.
      // There is no INSERT, UPDATE or DELETE policy for any role, so the Insert
      // and Update shapes here exist to satisfy the client's generic, not because
      // anything may write through them.
      reimbursement_payouts: {
        Row: ReimbursementPayout;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reimbursement_payout_items: {
        Row: ReimbursementPayoutItem;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      petty_cash_accounts: {
        Row: PettyCashAccount;
        Insert: Partial<PettyCashAccount> & { company_id: string; user_id: string };
        Update: Partial<PettyCashAccount>;
        Relationships: [];
      };
      petty_cash_transactions: {
        Row: PettyCashTransaction;
        Insert: Partial<PettyCashTransaction> & {
          account_id: string;
          amount: number;
          type: PettyCashTxnType;
          created_by: string;
        };
        Update: Partial<PettyCashTransaction>;
        Relationships: [];
      };
      invoice_comments: {
        Row: {
          id: string; invoice_id: string; receipt_id: string | null;
          author_type: string; author_name: string | null; message: string;
          resolved: boolean; created_at: string;
        };
        Insert: { invoice_id: string; message: string; author_type: string;
          receipt_id?: string | null; author_name?: string | null; resolved?: boolean };
        Update: Partial<Database['public']['Tables']['invoice_comments']['Row']>;
        Relationships: [];
      };
      invoice_activity: {
        Row: { id: string; invoice_id: string; event: string; meta: unknown; created_at: string };
        Insert: { invoice_id: string; event: string; meta?: unknown };
        Update: Partial<Database['public']['Tables']['invoice_activity']['Row']>;
        Relationships: [];
      };
      scanned_documents: {
        Row: ScannedDocument;
        Insert: Partial<ScannedDocument> & { project_id: string; company_id: string; file_url: string; created_by: string };
        Update: Partial<ScannedDocument>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: Partial<Invoice> & {
          project_id: string;
          period_start: string;
          period_end: string;
          total_amount: number;
          tax_amount: number;
          generated_by: string;
        };
        Update: Partial<Invoice>;
        Relationships: [];
      };
      invoice_receipts: {
        Row: InvoiceReceipt;
        Insert: InvoiceReceipt;
        Update: Partial<InvoiceReceipt>;
        Relationships: [];
      };
      app_notifications: {
        Row: AppNotification;
        Insert: Partial<AppNotification> & {
          company_id: string;
          recipient_id: string;
          actor_id?: string | null;
          type: string;
          title: string;
        };
        Update: Partial<AppNotification>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Public invoice reader for /public/invoices/:token (anon). Returns a JSON blob. */
      get_public_invoice: {
        Args: { p_token: string };
        Returns: unknown;
      };
      /** Client accepts/disputes a sent invoice from the public page (anon). */
      public_invoice_respond: {
        Args: { p_token: string; p_action: string; p_note?: string | null };
        Returns: boolean;
      };
      /** Logs that the client opened the public invoice (anon, throttled). */
      public_invoice_log_view: {
        Args: { p_token: string };
        Returns: undefined;
      };
      /** Client disputes a specific receipt (or the whole invoice) from the public page (anon). */
      public_invoice_dispute: {
        Args: { p_token: string; p_receipt_id: string | null; p_message: string };
        Returns: boolean;
      };
      /** Public lookup for the /join/:token page (callable by anon). */
      get_invite_info: {
        Args: { p_token: string };
        Returns: Array<{
          project_id: string | null;
          project_name: string | null;
          company_id: string | null;
          company_name: string | null;
          role: UserRole | null;
          is_valid: boolean;
          reason: string | null;
        }>;
      };
      /** Creates company + owner profile atomically (service_role only). */
      signup_company_v1: {
        Args: {
          p_user_id: string;
          p_full_name: string;
          p_phone: string;
          p_company_name: string;
          p_hq_location: string;
          p_sector: string;
        };
        Returns: string;
      };
      /** Creates profile + project_member row atomically (service_role only). */
      join_by_invite_v1: {
        Args: { p_user_id: string; p_token: string; p_full_name: string; p_phone: string };
        Returns: Array<{ project_id: string; role: UserRole }>;
      };
      /** Count of company invoices this month — callable by staff (no row exposure). */
      invoices_this_month_count: { Args: { p_project?: string | null }; Returns: number };
      /** Leader (capped by project budget) or owner allocates petty cash to a project member. */
      allocate_project_petty_cash: {
        Args: { p_project: string; p_user: string; p_amount: number; p_description?: string | null };
        Returns: string;
      };
      request_petty_cash_top_up: {
        Args: { p_user: string; p_amount: number; p_description?: string | null };
        Returns: string;
      };
      /** Finance withdraws a still-pending top-up. Returns rows changed. */
      cancel_petty_cash_request: { Args: { p_transaction: string }; Returns: number };
      respond_to_petty_cash_request: {
        Args: { p_transaction: string; p_accept: boolean };
        Returns: string;
      };
      /** Finance marks cash_personal receipts paid back (or undoes it). Returns rows changed. */
      mark_receipts_reimbursed: {
        Args: { p_receipt_ids: string[]; p_paid?: boolean };
        Returns: number;
      };
      /** Employee sends a completed receipt to finance. Never approves it. */
      submit_receipt: { Args: { p_receipt: string }; Returns: string };
      /** Finance approves, requests changes, or rejects. Reason required for the last two. */
      decide_receipt: {
        Args: { p_receipt: string; p_decision: string; p_reason?: string | null };
        Returns: string;
      };
      /**
       * Finance voids or corrects a booked petty-cash receipt. The only writer
       * of a reversal: petty_cash_transactions has no INSERT, UPDATE or DELETE
       * policy for anyone. p_transaction is an expected-state argument, so a
       * stale tab gets the previous result back instead of a second posting.
       */
      reverse_petty_cash_receipt: {
        Args: {
          p_receipt: string;
          p_transaction: string;
          p_mode: 'void' | 'correct';
          p_reason: string;
          p_new_amount?: number | null;
        };
        Returns: {
          status: 'void' | 'correct' | 'already_reversed';
          adjustment_id: string | null;
          expense_id?: string | null;
          balance: number;
        };
      };
      /**
       * Records that the company paid an employee back. Settlement, not expense:
       * the expense counted when the receipt was confirmed. One payout pays one
       * person, and amount_paid is snapshotted so a later edit cannot rewrite
       * what was handed over.
       */
      create_reimbursement_payout: {
        Args: {
          p_receipt_ids: string[];
          p_method?: 'cash' | 'mobile_money' | 'bank' | 'other' | null;
          p_reference?: string | null;
          p_note?: string | null;
        };
        Returns: { payout_id: string; total_amount: number; receipts: number };
      };
      /** Cancels a payment. Audited, reasoned, never deleted. */
      void_reimbursement_payout: {
        Args: { p_payout: string; p_reason: string };
        Returns: { status: 'voided' | 'already_voided'; payout_id: string; receipts?: number };
      };
      /** Staff ask finance to reverse a receipt. Moves no money, ever. */
      request_receipt_reversal: { Args: { p_receipt: string; p_reason: string }; Returns: string };
      /** Mints a single-use, 15-minute WhatsApp linking token. Plaintext is returned once. */
      create_whatsapp_link_token: { Args: Record<string, never>; Returns: string };
      /** Revokes the caller's WhatsApp connection. Returns rows changed. */
      revoke_whatsapp_identity: { Args: Record<string, never>; Returns: number };
      auth_company_id: { Args: Record<string, never>; Returns: string };
      auth_role: { Args: Record<string, never>; Returns: UserRole };
      auth_can_see_project: { Args: { pid: string }; Returns: boolean };
      /** Public company name search (anon + authenticated). */
      search_companies: {
        Args: { q: string };
        Returns: Array<{ id: string; name: string }>;
      };
      /** Checks a company's shared staff password (anon + authenticated). */
      verify_company_password: {
        Args: { p_company_id: string; p_password: string };
        Returns: boolean;
      };
      /** Owner-only: set/update the shared staff password for their company. */
      set_company_password: {
        Args: { p_password: string };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      project_status: ProjectStatus;
      receipt_status: ReceiptStatus;
      invoice_status: InvoiceStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
