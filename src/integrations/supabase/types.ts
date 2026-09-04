export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          channels: string[]
          created_at: string
          goal: string | null
          id: string
          instructions: string | null
          mode: string
          model: string
          name: string
          personality: string | null
          provider: string
          status: string
          workspace_id: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          goal?: string | null
          id?: string
          instructions?: string | null
          mode?: string
          model?: string
          name: string
          personality?: string | null
          provider?: string
          status?: string
          workspace_id: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          goal?: string | null
          id?: string
          instructions?: string | null
          mode?: string
          model?: string
          name?: string
          personality?: string | null
          provider?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          kind: string
          locked_at: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          status: Database["public"]["Enums"]["job_status"]
          workspace_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          status?: Database["public"]["Enums"]["job_status"]
          workspace_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          status?: Database["public"]["Enums"]["job_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge: {
        Row: {
          active: boolean
          category: string | null
          content: string
          id: string
          priority: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          content: string
          id?: string
          priority?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          content?: string
          id?: string
          priority?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          resource: string | null
          result: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          resource?: string | null
          result?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          resource?: string | null
          result?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flows: {
        Row: {
          bot_id: string | null
          created_at: string
          graph: Json
          id: string
          name: string
          response: string | null
          status: string
          trigger_keyword: string | null
          workspace_id: string
        }
        Insert: {
          bot_id?: string | null
          created_at?: string
          graph?: Json
          id?: string
          name: string
          response?: string | null
          status?: string
          trigger_keyword?: string | null
          workspace_id: string
        }
        Update: {
          bot_id?: string | null
          created_at?: string
          graph?: Json
          id?: string
          name?: string
          response?: string | null
          status?: string
          trigger_keyword?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_flows_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          account_id: string | null
          cloned_from: string | null
          created_at: string
          id: string
          last_event_at: string | null
          name: string
          status: string
          username: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          cloned_from?: string | null
          created_at?: string
          id?: string
          last_event_at?: string | null
          name: string
          status?: string
          username?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          cloned_from?: string | null
          created_at?: string
          id?: string
          last_event_at?: string | null
          name?: string
          status?: string
          username?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bots_cloned_from_fkey"
            columns: ["cloned_from"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_accounts: {
        Row: {
          account_id: string
          campaign_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          campaign_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          campaign_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_accounts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_destinations: {
        Row: {
          authorized: boolean
          campaign_id: string
          destination: string
          id: string
          workspace_id: string
        }
        Insert: {
          authorized?: boolean
          campaign_id: string
          destination: string
          id?: string
          workspace_id: string
        }
        Update: {
          authorized?: boolean
          campaign_id?: string
          destination?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_destinations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_destinations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_variations: {
        Row: {
          approved: boolean
          campaign_id: string
          content: string
          generated_by: string
          id: string
          workspace_id: string
        }
        Insert: {
          approved?: boolean
          campaign_id: string
          content: string
          generated_by?: string
          id?: string
          workspace_id: string
        }
        Update: {
          approved?: boolean
          campaign_id?: string
          content?: string
          generated_by?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_variations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_variations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          failed_count: number
          id: string
          link: string | null
          message: string | null
          name: string
          network: string
          next_run_at: string | null
          pace_presets: string[]
          posted_count: number
          scheduled_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          failed_count?: number
          id?: string
          link?: string | null
          message?: string | null
          name: string
          network?: string
          next_run_at?: string | null
          pace_presets?: string[]
          posted_count?: number
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          failed_count?: number
          id?: string
          link?: string | null
          message?: string | null
          name?: string
          network?: string
          next_run_at?: string | null
          pace_presets?: string[]
          posted_count?: number
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          id: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          contact_id: string
          id?: string
          tag_id: string
          workspace_id: string
        }
        Update: {
          contact_id?: string
          id?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          last_interaction_at: string | null
          name: string | null
          notes: string | null
          opt_in: boolean
          opt_out: boolean
          phone: string | null
          score: number
          source: string | null
          status: string
          telegram_id: string | null
          username: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_interaction_at?: string | null
          name?: string | null
          notes?: string | null
          opt_in?: boolean
          opt_out?: boolean
          phone?: string | null
          score?: number
          source?: string | null
          status?: string
          telegram_id?: string | null
          username?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_interaction_at?: string | null
          name?: string | null
          notes?: string | null
          opt_in?: boolean
          opt_out?: boolean
          phone?: string | null
          score?: number
          source?: string | null
          status?: string
          telegram_id?: string | null
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_categories: {
        Row: {
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_keywords: {
        Row: {
          category: string | null
          created_at: string
          id: string
          keyword: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          keyword: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          keyword?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_keywords_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          account_id: string | null
          created_at: string
          group_name: string
          group_source_id: string | null
          id: string
          known_members: number
          last_sync_at: string | null
          origin: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          group_name: string
          group_source_id?: string | null
          id?: string
          known_members?: number
          last_sync_at?: string | null
          origin?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          group_name?: string
          group_source_id?: string | null
          id?: string
          known_members?: number
          last_sync_at?: string | null
          origin?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_group_source_id_fkey"
            columns: ["group_source_id"]
            isOneToOne: false
            referencedRelation: "group_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_mirrors: {
        Row: {
          account_id: string | null
          authorized: boolean
          created_at: string
          destination_group: string
          id: string
          last_sync_at: string | null
          rules: Json
          source_group: string
          status: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          authorized?: boolean
          created_at?: string
          destination_group: string
          id?: string
          last_sync_at?: string | null
          rules?: Json
          source_group: string
          status?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          authorized?: boolean
          created_at?: string
          destination_group?: string
          id?: string
          last_sync_at?: string | null
          rules?: Json
          source_group?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_mirrors_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_mirrors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_sources: {
        Row: {
          category: string | null
          discovered_at: string
          id: string
          keyword: string | null
          last_checked_at: string | null
          link: string | null
          name: string
          origin: string | null
          score: number
          status: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          discovered_at?: string
          id?: string
          keyword?: string | null
          last_checked_at?: string | null
          link?: string | null
          name: string
          origin?: string | null
          score?: number
          status?: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          discovered_at?: string
          id?: string
          keyword?: string | null
          last_checked_at?: string | null
          link?: string | null
          name?: string
          origin?: string | null
          score?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          created_at: string
          id: string
          ig_user_id: string | null
          last_error: string | null
          status: string
          username: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ig_user_id?: string | null
          last_error?: string | null
          status?: string
          username: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ig_user_id?: string | null
          last_error?: string | null
          status?: string
          username?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_posts: {
        Row: {
          attempts: number
          caption: string | null
          created_at: string
          cta: string | null
          error: string | null
          hashtags: string[] | null
          id: string
          instagram_account_id: string | null
          media_url: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          caption?: string | null
          created_at?: string
          cta?: string | null
          error?: string | null
          hashtags?: string[] | null
          id?: string
          instagram_account_id?: string | null
          media_url?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          caption?: string | null
          created_at?: string
          cta?: string | null
          error?: string | null
          hashtags?: string[] | null
          id?: string
          instagram_account_id?: string | null
          media_url?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          message: string | null
          provider: string
          success: boolean
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          message?: string | null
          provider: string
          success?: boolean
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          message?: string | null
          provider?: string
          success?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_logs: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          level: string
          message: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          level?: string
          message: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          level?: string
          message?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          owner_id: string | null
          stage: string
          value: number | null
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          stage?: string
          value?: number | null
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          stage?: string
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_app_submissions: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          mini_app_id: string | null
          payload: Json
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          mini_app_id?: string | null
          payload?: Json
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          mini_app_id?: string | null
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mini_app_submissions_mini_app_id_fkey"
            columns: ["mini_app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mini_app_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_apps: {
        Row: {
          created_at: string
          cta: string | null
          description: string | null
          fields: Json
          id: string
          logo_url: string | null
          name: string
          post_signup_message: string | null
          status: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          cta?: string | null
          description?: string | null
          fields?: Json
          id?: string
          logo_url?: string | null
          name: string
          post_signup_message?: string | null
          status?: string
          url?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          cta?: string | null
          description?: string | null
          fields?: Json
          id?: string
          logo_url?: string | null
          name?: string
          post_signup_message?: string | null
          status?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_apps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          audience: string | null
          context: string | null
          created_at: string
          cta: string | null
          forbidden_words: string[] | null
          goals: string | null
          id: string
          language: string | null
          name: string
          niche: string | null
          pains: string | null
          preferred_words: string[] | null
          tone: string | null
          workspace_id: string
        }
        Insert: {
          audience?: string | null
          context?: string | null
          created_at?: string
          cta?: string | null
          forbidden_words?: string[] | null
          goals?: string | null
          id?: string
          language?: string | null
          name: string
          niche?: string | null
          pains?: string | null
          preferred_words?: string[] | null
          tone?: string | null
          workspace_id: string
        }
        Update: {
          audience?: string | null
          context?: string | null
          created_at?: string
          cta?: string | null
          forbidden_words?: string[] | null
          goals?: string | null
          id?: string
          language?: string | null
          name?: string
          niche?: string | null
          pains?: string | null
          preferred_words?: string[] | null
          tone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_payments: {
        Row: {
          amount: number
          copy_paste: string | null
          created_at: string
          id: string
          paid_at: string | null
          provider: string
          provider_charge_id: string | null
          qr_code: string | null
          status: string
          transaction_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          copy_paste?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          provider?: string
          provider_charge_id?: string | null
          qr_code?: string | null
          status?: string
          transaction_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          copy_paste?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          provider?: string
          provider_charge_id?: string | null
          qr_code?: string | null
          status?: string
          transaction_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_done: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_done?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_done?: boolean
        }
        Relationships: []
      }
      prospecting_campaigns: {
        Row: {
          created_at: string
          daily_cap_per_account: number
          id: string
          message: string | null
          messages_per_hour: number
          name: string
          niche: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          daily_cap_per_account?: number
          id?: string
          message?: string | null
          messages_per_hour?: number
          name?: string
          niche?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          daily_cap_per_account?: number
          id?: string
          message?: string | null
          messages_per_hour?: number
          name?: string
          niche?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_queue: {
        Row: {
          account_id: string | null
          attempts: number
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          message: string | null
          prospecting_campaign_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_item_status"]
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          prospecting_campaign_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_item_status"]
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          attempts?: number
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          prospecting_campaign_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_item_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_queue_prospecting_campaign_id_fkey"
            columns: ["prospecting_campaign_id"]
            isOneToOne: false
            referencedRelation: "prospecting_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          kind: string
          locked_at: string | null
          max_attempts: number
          payload: Json
          priority: number
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          workspace_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          workspace_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_calls: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          next_action: string | null
          observation: string | null
          owner_id: string | null
          phone: string | null
          result: string | null
          scheduled_at: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          next_action?: string | null
          observation?: string | null
          owner_id?: string | null
          phone?: string | null
          result?: string | null
          scheduled_at?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          next_action?: string | null
          observation?: string | null
          owner_id?: string | null
          phone?: string | null
          result?: string | null
          scheduled_at?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_calls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      smm_orders: {
        Row: {
          cost: number
          created_at: string
          customer: string | null
          id: string
          price: number
          provider_order_id: string | null
          quantity: number
          service_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          cost?: number
          created_at?: string
          customer?: string | null
          id?: string
          price?: number
          provider_order_id?: string | null
          quantity?: number
          service_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          customer?: string | null
          id?: string
          price?: number
          provider_order_id?: string | null
          quantity?: number
          service_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smm_orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "smm_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smm_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      smm_services: {
        Row: {
          category: string | null
          cost: number
          id: string
          name: string
          price: number
          provider: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          cost?: number
          id?: string
          name: string
          price?: number
          provider?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          cost?: number
          id?: string
          name?: string
          price?: number
          provider?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smm_services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          meta: Json | null
          scope: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          meta?: Json | null
          scope: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          meta?: Json | null
          scope?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_accounts: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_activity_at: string | null
          last_error: string | null
          last_sync_at: string | null
          name: string
          paused: boolean
          phone_masked: string | null
          proxy: string | null
          status: Database["public"]["Enums"]["account_status"]
          telegram_id: string | null
          username: string | null
          webhook_secret: string | null
          worker: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          last_activity_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          name: string
          paused?: boolean
          phone_masked?: string | null
          proxy?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          telegram_id?: string | null
          username?: string | null
          webhook_secret?: string | null
          worker?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_activity_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          paused?: boolean
          phone_masked?: string | null
          proxy?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          telegram_id?: string | null
          username?: string | null
          webhook_secret?: string | null
          worker?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_credentials: {
        Row: {
          account_id: string
          bot_token: string | null
          created_at: string
          tdata_object: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          bot_token?: string | null
          created_at?: string
          tdata_object?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          bot_token?: string | null
          created_at?: string
          tdata_object?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_updates: {
        Row: {
          account_id: string
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          telegram_update_id: number
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          payload: Json
          processed_at?: string | null
          telegram_update_id: number
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          telegram_update_id?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_updates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_updates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          customer: string | null
          id: string
          kind: string
          method: string | null
          reference: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer?: string | null
          id?: string
          kind: string
          method?: string | null
          reference?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer?: string | null
          id?: string
          kind?: string
          method?: string | null
          reference?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          direction: string
          id: string
          transaction_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          transaction_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          transaction_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          pending: number
          total_in: number
          total_out: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          pending?: number
          total_in?: number
          total_out?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          pending?: number
          total_in?: number
          total_out?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          daily_cap_per_account: number
          instagram_configured: boolean
          messages_per_hour: number
          niche: string | null
          payments_configured: boolean
          telegram_configured: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          daily_cap_per_account?: number
          instagram_configured?: boolean
          messages_per_hour?: number
          niche?: string | null
          payments_configured?: boolean
          telegram_configured?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          daily_cap_per_account?: number
          instagram_configured?: boolean
          messages_per_hour?: number
          niche?: string | null
          payments_configured?: boolean
          telegram_configured?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          demo_mode: boolean
          global_pause: boolean
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          demo_mode?: boolean
          global_pause?: boolean
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          demo_mode?: boolean
          global_pause?: boolean
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_queue_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          kind: string
          locked_at: string | null
          max_attempts: number
          payload: Json
          priority: number
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "queue_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_workspace_id: { Args: never; Returns: string }
      has_workspace_access: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _workspace_id: string
        }
        Returns: boolean
      }
      watchdog_requeue: {
        Args: never
        Returns: {
          failed: number
          requeued: number
        }[]
      }
    }
    Enums: {
      account_status:
        | "online"
        | "pending_auth"
        | "failed"
        | "checking"
        | "paused"
      app_role: "owner" | "admin" | "manager" | "operator" | "viewer"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "finished"
        | "cancelled"
        | "failed"
      job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "retry"
        | "cancelled"
      queue_item_status:
        | "pending"
        | "processing"
        | "sent"
        | "skipped"
        | "failed"
        | "retry"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: [
        "online",
        "pending_auth",
        "failed",
        "checking",
        "paused",
      ],
      app_role: ["owner", "admin", "manager", "operator", "viewer"],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "finished",
        "cancelled",
        "failed",
      ],
      job_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "retry",
        "cancelled",
      ],
      queue_item_status: [
        "pending",
        "processing",
        "sent",
        "skipped",
        "failed",
        "retry",
        "cancelled",
      ],
    },
  },
} as const
