-- Swift-CRM demo data — the SWIPETOUCH tenant (1 tenant, 6 users, 4 funnels,
-- 9 leads with stage history, 5 FY targets, 2 purchase orders, app config).
--
-- Load into a FRESH database AFTER the schema exists, INSTEAD OF `npm run seed`:
--   docker compose up -d
--   cd backend && npm run db:push
--   docker exec -i school_crm_db psql -U crm -d school_crm < prisma/demo-data.sql
--
-- Then log in: client code SWIPETOUCH / admin@schoolcrm.local / Admin@12345
-- (the "State Head" reps use north.head|south.head@schoolcrm.local / Head@12345).
-- Passwords are bcrypt hashes of these documented demo credentials.
-- Data-only dump: FK triggers are disabled during load and sequences are reset.

--
-- PostgreSQL database dump
--

\restrict xBK6fxvm4qkMJrAY3sgm1m3NNcefmSdPFxyyBGhypePKNPkrWJcWJhnwbqAdUX2

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: Tenant; Type: TABLE DATA; Schema: public; Owner: crm
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public."Tenant" DISABLE TRIGGER ALL;

INSERT INTO public."Tenant" (id, code, name, active, "createdAt") VALUES (1, 'SWIPETOUCH', 'SwipeTouch', true, '2026-11-05 01:11:44.481');


ALTER TABLE public."Tenant" ENABLE TRIGGER ALL;

--
-- Data for Name: AppConfig; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."AppConfig" DISABLE TRIGGER ALL;

INSERT INTO public."AppConfig" (id, stages, "repColumns", "exportEnabled", "readOnly", "repsReadOnly", "updatedAt", "ageingThresholdDays", logo, "poTemplate", "tenantId") VALUES (1, '[{"id": "cold", "name": "Cold", "color": "#8c8c8c"}, {"id": "warm", "name": "Warm", "color": "#faad14"}, {"id": "hot", "name": "Hot", "color": "#f5222d"}, {"id": "negotiation", "name": "Negotiation", "color": "#722ed1"}, {"id": "closure", "name": "Closure", "color": "#52c41a"}, {"id": "not-interested", "name": "Not Int.", "color": "#a8071a"}, {"id": "stale", "name": "Stale", "color": "#595959"}]', '["board", "studentStrength", "totalContractValue", "cac", "ageing", "reminder", "region", "contact", "funnel", "owner", "stage"]', true, false, false, '2026-11-04 23:11:39.316', 20, NULL, NULL, 1);


ALTER TABLE public."AppConfig" ENABLE TRIGGER ALL;

--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."User" DISABLE TRIGGER ALL;

INSERT INTO public."User" (id, name, email, "passwordHash", role, region, active, "createdAt", "canExport", locked, "tenantId") VALUES (1, 'Super Admin', 'admin@schoolcrm.local', '$2a$10$TtfBTHwCSHzXSJk/YtCb/u2bl/1vPsHv5KFRRnVGZb3VJskdNg0ei', 'SUPER_ADMIN', NULL, true, '2026-10-30 10:32:12.273', true, false, 1);
INSERT INTO public."User" (id, name, email, "passwordHash", role, region, active, "createdAt", "canExport", locked, "tenantId") VALUES (2, 'North Manager', 'north@schoolcrm.local', '$2a$10$fPAr7hWQ0zitfDwrOOTjV.pmqzkpVcD1H.vSh1d.juseA2/01CSL6', 'MANAGER', 'North', true, '2026-10-30 10:32:37.327', true, false, 1);
INSERT INTO public."User" (id, name, email, "passwordHash", role, region, active, "createdAt", "canExport", locked, "tenantId") VALUES (4, 'Rep Two', 'rep2@schoolcrm.local', '$2a$10$e3y4jb4SeJcf55QC2jFPyeTFd2Cna//InA8fJn7YD/sWK.0ARFX6.', 'SALES_REP', 'North', true, '2026-10-31 10:13:10.419', true, false, 1);
INSERT INTO public."User" (id, name, email, "passwordHash", role, region, active, "createdAt", "canExport", locked, "tenantId") VALUES (3, 'Rep One', 'rep@schoolcrm.local', '$2a$10$LZXF21VbaCraw2Ynn5k6tOtI2w1GJeqBz.X9gXI8Omhkc6WLpV49.', 'SALES_REP', 'South', true, '2026-10-30 10:33:00.507', true, false, 1);
INSERT INTO public."User" (id, name, email, "passwordHash", role, region, active, "createdAt", "canExport", locked, "tenantId") VALUES (6, 'South State Head', 'south.head@schoolcrm.local', '$2a$10$5iwLYj2MpMBKEpZGLsp74OgrSkBqqXatmzMa3kLF0kL545pkp6HgS', 'SALES_REP', NULL, true, '2026-10-31 10:42:26.577', true, false, 1);
INSERT INTO public."User" (id, name, email, "passwordHash", role, region, active, "createdAt", "canExport", locked, "tenantId") VALUES (5, 'North State Head', 'north.head@schoolcrm.local', '$2a$10$vbuWdqOZdFMT3AbEDbTbRevo.jJBxpSdgVpzTJt3W3VSQTNtW0hAq', 'SALES_REP', NULL, true, '2026-10-31 10:42:26.498', true, false, 1);


ALTER TABLE public."User" ENABLE TRIGGER ALL;

--
-- Data for Name: Funnel; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."Funnel" DISABLE TRIGGER ALL;

INSERT INTO public."Funnel" (id, name, description, "createdById", "createdAt", "tenantId") VALUES (1, 'North India Schools', 'Leads from northern region outreach', NULL, '2026-10-30 10:32:12.277', 1);
INSERT INTO public."Funnel" (id, name, description, "createdById", "createdAt", "tenantId") VALUES (2, 'South India Schools', 'Leads from southern region outreach', NULL, '2026-10-30 10:32:12.277', 1);
INSERT INTO public."Funnel" (id, name, description, "createdById", "createdAt", "tenantId") VALUES (3, 'Inbound / Website', 'Self-registered and referral leads', NULL, '2026-10-30 10:32:12.277', 1);
INSERT INTO public."Funnel" (id, name, description, "createdById", "createdAt", "tenantId") VALUES (4, 'Funnel 1', NULL, 1, '2026-10-31 09:41:32.933', 1);


ALTER TABLE public."Funnel" ENABLE TRIGGER ALL;

--
-- Data for Name: ImportBatch; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."ImportBatch" DISABLE TRIGGER ALL;

INSERT INTO public."ImportBatch" (id, filename, "rowCount", "uploadedById", "createdAt", "tenantId") VALUES (1, 'leads.csv', 2, 1, '2026-10-30 10:33:00.814', 1);


ALTER TABLE public."ImportBatch" ENABLE TRIGGER ALL;

--
-- Data for Name: Lead; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."Lead" DISABLE TRIGGER ALL;

INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (2, 'Rep School', NULL, NULL, 'West', NULL, NULL, NULL, NULL, 'cold', NULL, NULL, 3, '2026-10-30 10:33:00.758', '2026-10-30 10:33:00.758', '2026-10-31 09:47:23.578', NULL, NULL, NULL, NULL, NULL, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (3, 'St Xaviers', 'ICSE', 800, 'South', 'Chennai', 'Mrs Rao', 'INFLUENCER', '900011', 'warm', 'XLSX import', 3, NULL, '2026-10-30 10:33:00.817', '2026-10-30 10:33:00.817', '2026-10-31 09:47:23.578', NULL, NULL, NULL, NULL, NULL, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (4, 'Green Valley', 'State Board', 450, 'West', 'Pune', 'Mr Kadam', 'PROMOTER', '900022', 'cold', 'XLSX import', 3, NULL, '2026-10-30 10:33:00.819', '2026-10-30 10:33:00.819', '2026-10-31 09:47:23.578', NULL, NULL, NULL, NULL, NULL, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (5, 'DPS', 'CBSE', 1500, 'North', 'Delhi', 'Mr. Pranab Kumar', 'PROMOTER', NULL, 'cold', NULL, 4, 3, '2026-10-31 09:42:25.24', '2026-10-31 10:01:59.859', '2026-10-31 09:47:23.578', NULL, NULL, NULL, NULL, NULL, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (7, 'CAC Test School', NULL, 400, NULL, NULL, 'Mr Rao', NULL, NULL, 'cold', NULL, 1, NULL, '2026-10-31 10:25:44.775', '2026-10-31 10:25:44.838', '2026-10-31 10:25:44.775', NULL, NULL, NULL, 600000, 18500, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (8, 'NH School', NULL, 100, NULL, NULL, 'NH', NULL, NULL, 'warm', NULL, 1, 5, '2026-10-31 10:43:41.523', '2026-11-03 22:36:00.87', '2026-10-31 10:43:41.523', NULL, NULL, NULL, 100000, NULL, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (9, 'Admin RO School', NULL, 1, NULL, NULL, 'y', NULL, NULL, 'not-interested', NULL, 1, NULL, '2026-11-03 22:36:26.77', '2026-11-03 23:18:10.484', '2026-11-03 22:36:26.77', NULL, '2026-11-04 08:00:00', NULL, 1, NULL, NULL, 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (6, 'Sunrise Academy', NULL, 600, NULL, NULL, 'Ms Iyer', 'INFLUENCER', NULL, 'closure', NULL, 1, NULL, '2026-10-31 09:49:09.187', '2026-11-03 23:57:08.579', '2026-09-15 00:00:00', 300, '2026-10-20 00:00:00', 'Follow up on proposal', 750000, NULL, '2026-11-03 23:57:08.579', 1);
INSERT INTO public."Lead" (id, "schoolName", board, "studentStrength", region, location, "contactName", "contactType", "contactPhone", stage, source, "funnelId", "ownerId", "createdAt", "updatedAt", "leadDate", "pspmRate", "reminderAt", "reminderNote", "totalContractValue", cac, "closedAt", "tenantId") VALUES (1, 'Delhi Public School', 'CBSE', 1200, 'North', 'New Delhi', 'Mr Sharma', 'PROMOTER', '9876543210', 'closure', NULL, 3, NULL, '2026-10-30 10:32:37.413', '2026-11-04 20:07:16.606', '2026-10-31 09:47:23.578', NULL, NULL, NULL, NULL, NULL, '2026-11-04 20:07:16.606', 1);


ALTER TABLE public."Lead" ENABLE TRIGGER ALL;

--
-- Data for Name: LeadStageHistory; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."LeadStageHistory" DISABLE TRIGGER ALL;

INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (1, 1, NULL, 'cold', 'Lead created', 1, '2026-10-30 10:32:37.413', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (2, 1, 'cold', 'warm', 'Met principal', 1, '2026-10-30 10:32:37.469', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (3, 2, NULL, 'cold', 'Lead created', 3, '2026-10-30 10:33:00.758', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (4, 3, NULL, 'warm', 'Imported (batch 1)', 1, '2026-10-30 10:33:00.817', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (5, 4, NULL, 'cold', 'Imported (batch 1)', 1, '2026-10-30 10:33:00.819', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (6, 5, NULL, 'cold', 'Lead created', 1, '2026-10-31 09:42:25.24', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (7, 6, NULL, 'cold', 'Lead created', 1, '2026-10-31 09:49:09.187', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (8, 6, 'cold', 'warm', NULL, 1, '2026-10-31 09:57:18.566', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (9, 6, 'warm', 'hot', NULL, 1, '2026-10-31 10:01:34.218', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (10, 6, 'hot', 'warm', 'Re-qualifying', 1, '2026-10-31 10:01:34.252', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (11, 5, 'cold', 'warm', NULL, 3, '2026-10-31 10:01:34.344', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (12, 6, 'warm', 'cold', NULL, 1, '2026-10-31 10:01:34.436', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (13, 5, 'warm', 'cold', NULL, 1, '2026-10-31 10:01:59.859', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (14, 7, NULL, 'cold', 'Lead created', 1, '2026-10-31 10:25:44.775', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (15, 8, NULL, 'cold', 'Lead created', 5, '2026-10-31 10:43:41.523', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (16, 8, 'cold', 'warm', NULL, 1, '2026-11-03 22:36:00.87', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (17, 9, NULL, 'cold', 'Lead created', 1, '2026-11-03 22:36:26.77', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (18, 9, 'cold', 'not-interested', 'Declined for this year', 1, '2026-11-03 23:15:33.098', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (19, 6, 'cold', 'closure', NULL, 1, '2026-11-03 23:57:08.579', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (20, 1, 'warm', 'hot', NULL, 1, '2026-11-03 23:58:32.21', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (21, 1, 'hot', 'negotiation', NULL, 1, '2026-11-03 23:58:56.506', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (22, 1, 'negotiation', 'closure', NULL, 1, '2026-11-03 23:58:58.541', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (23, 1, 'closure', 'warm', NULL, 1, '2026-11-04 20:07:16.566', 1);
INSERT INTO public."LeadStageHistory" (id, "leadId", "fromStage", "toStage", note, "changedById", "changedAt", "tenantId") VALUES (24, 1, 'warm', 'closure', NULL, 1, '2026-11-04 20:07:16.606', 1);


ALTER TABLE public."LeadStageHistory" ENABLE TRIGGER ALL;

--
-- Data for Name: PurchaseOrder; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."PurchaseOrder" DISABLE TRIGGER ALL;

INSERT INTO public."PurchaseOrder" (id, "leadId", "poNumber", "dealDate", "contractExpiry", "valueType", "perStudentRate", "studentStrength", "monthlyAmount", "baseAmount", "gstPercent", "gstAmount", "grandTotal", "billingCycle", "schoolName", "addresseeTitle", board, contacts, "createdById", "createdAt", "updatedAt", "tenantId") VALUES (1, 6, 'PO/2026/0006', '2026-09-15 00:00:00', '2028-09-14 00:00:00', 'PSPM', 11, 1300, NULL, 14300, 18, 2574, 16874, 'QUARTERLY', 'Sunrise Academy', 'Principal', 'CBSE', '[{"name": "Ms Iyer", "email": "iyer@sunrise.edu", "phone": "9876500000"}, {"name": "Mr Rao", "email": "", "phone": "9876511111"}]', 1, '2026-11-03 23:52:37.013', '2026-11-03 23:52:37.013', 1);
INSERT INTO public."PurchaseOrder" (id, "leadId", "poNumber", "dealDate", "contractExpiry", "valueType", "perStudentRate", "studentStrength", "monthlyAmount", "baseAmount", "gstPercent", "gstAmount", "grandTotal", "billingCycle", "schoolName", "addresseeTitle", board, contacts, "createdById", "createdAt", "updatedAt", "tenantId") VALUES (2, 1, 'PO/2026/0001', '2026-11-03 23:58:58.677', '2029-05-03 07:00:00', 'PSPM', 15, 1200, NULL, 18000, 18, 3240, 21240, 'MONTHLY', 'Delhi Public School', 'Principal', 'CBSE', '[{"name": "Mr Sharma", "email": "", "phone": "9876543210"}]', 1, '2026-11-03 23:59:36.544', '2026-11-04 00:00:06.872', 1);


ALTER TABLE public."PurchaseOrder" ENABLE TRIGGER ALL;

--
-- Data for Name: Target; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."Target" DISABLE TRIGGER ALL;

INSERT INTO public."Target" (id, fy, dimension, "refKey", amount, "updatedAt", "tenantId") VALUES (1, '2026-27', 'OVERALL', '', 13000000, '2026-11-05 00:51:18.251', 1);
INSERT INTO public."Target" (id, fy, dimension, "refKey", amount, "updatedAt", "tenantId") VALUES (2, '2026-27', 'REGION', 'North', 8000000, '2026-11-05 00:51:18.273', 1);
INSERT INTO public."Target" (id, fy, dimension, "refKey", amount, "updatedAt", "tenantId") VALUES (6, '2026-27', 'REGION', 'South', 1000000, '2026-11-05 00:51:18.276', 1);
INSERT INTO public."Target" (id, fy, dimension, "refKey", amount, "updatedAt", "tenantId") VALUES (7, '2026-27', 'REGION', 'West', 1000000, '2026-11-05 00:51:18.279', 1);
INSERT INTO public."Target" (id, fy, dimension, "refKey", amount, "updatedAt", "tenantId") VALUES (3, '2026-27', 'FUNNEL', '1', 3000000, '2026-11-05 00:51:18.285', 1);


ALTER TABLE public."Target" ENABLE TRIGGER ALL;

--
-- Data for Name: _FunnelAccess; Type: TABLE DATA; Schema: public; Owner: crm
--

ALTER TABLE public."_FunnelAccess" DISABLE TRIGGER ALL;

INSERT INTO public."_FunnelAccess" ("A", "B") VALUES (1, 5);
INSERT INTO public."_FunnelAccess" ("A", "B") VALUES (2, 6);
INSERT INTO public."_FunnelAccess" ("A", "B") VALUES (3, 6);


ALTER TABLE public."_FunnelAccess" ENABLE TRIGGER ALL;

--
-- Name: Funnel_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."Funnel_id_seq"', 4, true);


--
-- Name: ImportBatch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."ImportBatch_id_seq"', 1, true);


--
-- Name: LeadStageHistory_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."LeadStageHistory_id_seq"', 24, true);


--
-- Name: Lead_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."Lead_id_seq"', 9, true);


--
-- Name: PurchaseOrder_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."PurchaseOrder_id_seq"', 3, true);


--
-- Name: Target_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."Target_id_seq"', 8, true);


--
-- Name: Tenant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."Tenant_id_seq"', 2, true);


--
-- Name: User_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public."User_id_seq"', 7, true);


--
-- Name: appconfig_id_seq; Type: SEQUENCE SET; Schema: public; Owner: crm
--

SELECT pg_catalog.setval('public.appconfig_id_seq', 2, true);


--
-- PostgreSQL database dump complete
--

\unrestrict xBK6fxvm4qkMJrAY3sgm1m3NNcefmSdPFxyyBGhypePKNPkrWJcWJhnwbqAdUX2

