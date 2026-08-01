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
export type ReceiptStatus = 'processing' | 'confirmed' | 'duplicate' | 'error';
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
  created_by: string;
  created_at: string;
};

export type ProjectMember = {
  project_id: string;
  profile_id: string;
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

export type PaymentMethod = 'cash_personal' | 'petty_cash';
export type PettyCashTxnType = 'allocation' | 'expense' | 'adjustment';

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
  description: string | null;
  created_by: string;
  created_at: string;
};

export type Receipt = {
  id: string;
  project_id: string;
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
  payment_method: PaymentMethod;
  raw_ai_response: unknown;
  low_confidence_fields: string[];
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
        Insert: ProjectMember;
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
