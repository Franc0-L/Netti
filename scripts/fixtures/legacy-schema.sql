-- Legacy schema fixture.
--
-- Reproduces the production Neon instance before the reconciliation
-- migration: the ten runtime tables without checks, foreign keys (except
-- the two cascade ones), triggers, functions or secondary indexes.
-- The migration check applies 0002 on top of it to prove that a legacy
-- database reaches the canonical schema in a single pass.

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.7 (a21afb5)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: article_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_revisions (
    id integer NOT NULL,
    article_id integer NOT NULL,
    version integer NOT NULL,
    snapshot text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.article_revisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: article_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.article_revisions_id_seq OWNED BY public.article_revisions.id;


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id integer NOT NULL,
    kind text NOT NULL,
    slug text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    published_at timestamp with time zone,
    author text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    cover_image_url text,
    cover_alt text,
    cover_media_id integer,
    status text DEFAULT 'draft'::text NOT NULL,
    previous_status text,
    trashed_at timestamp with time zone,
    featured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    game_id integer,
    score integer,
    score_reason text,
    verdict text,
    category text,
    source_name text,
    source_url text,
    seo_title text,
    seo_description text,
    og_image_url text,
    og_media_id integer
);


--
-- Name: articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.articles_id_seq OWNED BY public.articles.id;


--
-- Name: cron_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_runs (
    job_name text NOT NULL,
    last_success_at timestamp with time zone,
    last_run_at timestamp with time zone DEFAULT now() NOT NULL,
    last_published_at timestamp with time zone,
    last_id integer,
    backup_restored_at timestamp with time zone
);


--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.games (
    id integer NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    developer text,
    publisher text,
    release_date timestamp with time zone,
    platforms text[] DEFAULT '{}'::text[] NOT NULL,
    genres text[] DEFAULT '{}'::text[] NOT NULL,
    external_source text,
    external_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    cover_image_url text,
    cover_alt text,
    cover_media_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id integer NOT NULL,
    ip_hash text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    success boolean DEFAULT false NOT NULL
);


--
-- Name: login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_attempts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_attempts_id_seq OWNED BY public.login_attempts.id;


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id integer NOT NULL,
    storage_key text NOT NULL,
    public_url text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    bytes integer NOT NULL,
    content_type text DEFAULT 'image/webp'::text NOT NULL,
    alt text,
    credit text,
    rights text DEFAULT 'own'::text NOT NULL,
    source_url text,
    pending_delete_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_id_seq OWNED BY public.media.id;


--
-- Name: media_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_variants (
    id integer NOT NULL,
    media_id integer NOT NULL,
    width integer NOT NULL,
    storage_key text NOT NULL,
    public_url text NOT NULL,
    bytes integer NOT NULL
);


--
-- Name: media_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_variants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_variants_id_seq OWNED BY public.media_variants.id;


--
-- Name: redirects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redirects (
    id integer NOT NULL,
    from_path text NOT NULL,
    to_path text NOT NULL,
    status_code integer DEFAULT 308 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: redirects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.redirects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: redirects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.redirects_id_seq OWNED BY public.redirects.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    user_agent text,
    ip_hash text
);


--
-- Name: storage_orphans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_orphans (
    id integer NOT NULL,
    storage_key text NOT NULL,
    action text DEFAULT 'put'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    repaired_at timestamp with time zone
);


--
-- Name: storage_orphans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.storage_orphans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: storage_orphans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.storage_orphans_id_seq OWNED BY public.storage_orphans.id;


--
-- Name: article_revisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_revisions ALTER COLUMN id SET DEFAULT nextval('public.article_revisions_id_seq'::regclass);


--
-- Name: articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles ALTER COLUMN id SET DEFAULT nextval('public.articles_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: login_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts ALTER COLUMN id SET DEFAULT nextval('public.login_attempts_id_seq'::regclass);


--
-- Name: media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media ALTER COLUMN id SET DEFAULT nextval('public.media_id_seq'::regclass);


--
-- Name: media_variants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_variants ALTER COLUMN id SET DEFAULT nextval('public.media_variants_id_seq'::regclass);


--
-- Name: redirects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redirects ALTER COLUMN id SET DEFAULT nextval('public.redirects_id_seq'::regclass);


--
-- Name: storage_orphans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_orphans ALTER COLUMN id SET DEFAULT nextval('public.storage_orphans_id_seq'::regclass);


--
-- Name: article_revisions article_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_revisions
    ADD CONSTRAINT article_revisions_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: cron_runs cron_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_runs
    ADD CONSTRAINT cron_runs_pkey PRIMARY KEY (job_name);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: games games_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_slug_unique UNIQUE (slug);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: media media_storage_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_storage_key_unique UNIQUE (storage_key);


--
-- Name: media_variants media_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_variants
    ADD CONSTRAINT media_variants_pkey PRIMARY KEY (id);


--
-- Name: media_variants media_variants_storage_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_variants
    ADD CONSTRAINT media_variants_storage_key_unique UNIQUE (storage_key);


--
-- Name: redirects redirects_from_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redirects
    ADD CONSTRAINT redirects_from_path_unique UNIQUE (from_path);


--
-- Name: redirects redirects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redirects
    ADD CONSTRAINT redirects_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: storage_orphans storage_orphans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_orphans
    ADD CONSTRAINT storage_orphans_pkey PRIMARY KEY (id);


--
-- Name: article_revisions article_revisions_article_id_articles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_revisions
    ADD CONSTRAINT article_revisions_article_id_articles_id_fk FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: media_variants media_variants_media_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_variants
    ADD CONSTRAINT media_variants_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


