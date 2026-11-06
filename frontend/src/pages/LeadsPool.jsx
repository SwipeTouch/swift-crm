import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Input, Select, Space, Tag, Row, Col, InputNumber, Popconfirm, Checkbox, Tooltip, Dropdown, Alert, Segmented, DatePicker, App, Typography, theme,
} from 'antd';
import { PlusOutlined, ReloadOutlined, ArrowRightOutlined, ArrowLeftOutlined, BellOutlined, SettingOutlined, DownloadOutlined, PrinterOutlined, MoreOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import { useAuth, canManageData } from '../auth';
import { useConfig } from '../config';
import { inr, ageingDays, isReminderDue } from '../format';
import LeadFormModal from '../components/LeadFormModal';
import LeadDetailDrawer from '../components/LeadDetailDrawer';
import PurchaseOrderModal from '../components/PurchaseOrderModal';

const CLOSURE_STAGE = 'closure';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const CONTACT_LABEL = { INFLUENCER: 'Influencer', PROMOTER: 'Promoter' };

// Columns the user can show/hide (School and Actions are always shown).
const TOGGLEABLE_COLS = [
  { key: 'board', label: 'Board' },
  { key: 'studentStrength', label: 'Students' },
  { key: 'totalContractValue', label: 'TCV' },
  { key: 'cac', label: 'CAC' },
  { key: 'ageing', label: 'Ageing' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'region', label: 'Region' },
  { key: 'contact', label: 'Contact' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'owner', label: 'Owner' },
  { key: 'stage', label: 'Stage' },
];
const ALL_COL_KEYS = TOGGLEABLE_COLS.map((c) => c.key);
const COLS_STORAGE_KEY = 'crm_visible_cols';
const ACTIONS_COLLAPSED_KEY = 'crm_actions_collapsed';

export default function LeadsPool() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { stageName, stageColor, orderedIds, nextStageId, prevStageId, exportEnabled, readOnly, repsReadOnly, repColumns, ageingThresholdDays } = useConfig();

  const isRep = user?.role === 'SALES_REP';
  // Whether this user may change leads (respects global + per-user read-only locks).
  const canWrite = user?.role === 'SUPER_ADMIN' || (!readOnly && !(repsReadOnly && isRep) && !user?.locked);
  const canExportLeads = exportEnabled && user?.canExport !== false;

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState();
  const [sortOrder, setSortOrder] = useState();

  const [funnels, setFunnels] = useState([]);
  const [funnelStats, setFunnelStats] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterMeta, setFilterMeta] = useState({ regions: [], boards: [] });

  const [filters, setFilters] = useState({
    search: '', region: undefined, stage: undefined, board: undefined,
    funnelId: undefined, ownerId: undefined, minStrength: undefined, maxStrength: undefined,
    reminderDue: false, leadDateFrom: undefined, leadDateTo: undefined, minAge: undefined, maxAge: undefined,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [poLead, setPoLead] = useState(null);

  // Which columns are visible — remembered per browser.
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_STORAGE_KEY));
      if (Array.isArray(saved)) return saved;
    } catch { /* ignore */ }
    return ALL_COL_KEYS;
  });
  useEffect(() => {
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(visibleCols)); } catch { /* ignore */ }
  }, [visibleCols]);

  // Collapse the Actions column to reclaim table width (remembered per browser).
  const [actionsCollapsed, setActionsCollapsed] = useState(() => {
    try { return localStorage.getItem(ACTIONS_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(ACTIONS_COLLAPSED_KEY, actionsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [actionsCollapsed]);

  const fetchLeads = useCallback(() => {
    setLoading(true);
    const params = { page, pageSize };
    if (sortKey && sortOrder) {
      params.sort = sortKey;
      params.order = sortOrder;
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v === false) return;
      if (v !== undefined && v !== '' && v !== null) params[k] = v;
    });
    api
      .get('/leads', { params })
      .then((r) => {
        setData(r.data.data);
        setTotal(r.data.total);
      })
      .catch((e) => message.error(e.response?.data?.error || 'Could not load leads'))
      .finally(() => setLoading(false));
  }, [page, pageSize, filters, sortKey, sortOrder, message]);

  const refreshStats = useCallback(() => {
    api.get('/leads/stats').then((r) => setFunnelStats(r.data.funnels)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const refreshAll = () => { fetchLeads(); refreshStats(); };

  useEffect(() => {
    api.get('/funnels').then((r) => setFunnels(r.data.data)).catch(() => {});
    api.get('/leads/filters').then((r) => setFilterMeta(r.data)).catch(() => {});
    if (canManageData(user)) {
      api.get('/users').then((r) => setUsers(r.data.data)).catch(() => {});
    }
  }, [user]);

  const setF = (patch) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const resetFilters = () => {
    setPage(1);
    setFilters({
      search: '', region: undefined, stage: undefined, board: undefined,
      funnelId: undefined, ownerId: undefined, minStrength: undefined, maxStrength: undefined,
      reminderDue: false, leadDateFrom: undefined, leadDateTo: undefined, minAge: undefined, maxAge: undefined,
    });
  };

  const promote = async (lead) => {
    const to = nextStageId(lead.stage);
    try {
      await api.post(`/leads/${lead.id}/promote`, {});
      message.success(`${lead.schoolName} → ${stageName(to)}`);
      refreshAll();
      if (to === CLOSURE_STAGE) setPoLead({ ...lead, stage: to }); // deal won → raise PO
    } catch (e) {
      message.error(e.response?.data?.error || 'Promote failed');
    }
  };

  const demote = async (lead) => {
    try {
      await api.post(`/leads/${lead.id}/demote`, {});
      message.success(`${lead.schoolName} → ${stageName(prevStageId(lead.stage))}`);
      refreshAll();
    } catch (e) {
      message.error(e.response?.data?.error || 'Move back failed');
    }
  };

  const exportXlsx = async () => {
    try {
      const params = {};
      if (sortKey && sortOrder) {
        params.sort = sortKey;
        params.order = sortOrder;
      }
      Object.entries(filters).forEach(([k, v]) => {
        if (v === false) return;
        if (v !== undefined && v !== '' && v !== null) params[k] = v;
      });
      const r = await api.get('/leads/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(e.response?.data?.error || 'Export failed');
    }
  };

  const remove = async (lead) => {
    try {
      await api.delete(`/leads/${lead.id}`);
      message.success('Lead deleted');
      refreshAll();
    } catch (e) {
      message.error(e.response?.data?.error || 'Delete failed');
    }
  };

  // Row actions, shared by the inline column and the collapsed ⋯ menu.
  const renderActions = (r, vertical) => {
    const next = nextStageId(r.stage);
    const prev = prevStageId(r.stage);
    // Closed leads are locked (only a Super Admin may still change the stage).
    const locked = r.stage === CLOSURE_STAGE && user?.role !== 'SUPER_ADMIN';
    return (
      <Space size="small" direction={vertical ? 'vertical' : 'horizontal'} style={vertical ? { width: '100%' } : undefined}>
        <Button size="small" block={vertical} onClick={() => { setEditingLead(r); setFormOpen(true); }}>
          {canWrite ? 'Edit' : 'View'}
        </Button>
        {canWrite && !locked && canManageData(user) && (
          <Button size="small" block={vertical} icon={<ArrowLeftOutlined />} disabled={!prev} onClick={() => demote(r)}>
            {prev ? `To ${stageName(prev)}` : 'First'}
          </Button>
        )}
        {canWrite && !locked && (
          <Button size="small" block={vertical} type="primary" icon={<ArrowRightOutlined />} disabled={!next} onClick={() => promote(r)}>
            {next ? `To ${stageName(next)}` : 'Final'}
          </Button>
        )}
        {locked && <Tag color="green">Closed</Tag>}
        {r.stage === CLOSURE_STAGE && (
          <Button size="small" block={vertical} onClick={() => setPoLead(r)}>PO</Button>
        )}
        {canWrite && canManageData(user) && (
          <Popconfirm title="Delete this lead?" onConfirm={() => remove(r)} okText="Delete" okButtonProps={{ danger: true }}>
            <Button size="small" block={vertical} danger>Delete</Button>
          </Popconfirm>
        )}
      </Space>
    );
  };

  const sortable = (key) => ({
    sorter: true,
    sortOrder: sortKey === key ? sortOrder : null,
  });

  const onTableChange = (pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextKey = active && active.order ? active.columnKey : undefined;
    const nextOrder = active && active.order ? active.order : undefined;
    const sortChanged = nextKey !== sortKey || nextOrder !== sortOrder;
    setSortKey(nextKey);
    setSortOrder(nextOrder);
    setPageSize(pagination.pageSize);
    setPage(sortChanged ? 1 : pagination.current);
  };

  const columns = [
    {
      title: '#', key: 'seq', width: 64, align: 'right', fixed: 'left',
      render: (_v, _r, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'School', dataIndex: 'schoolName', key: 'schoolName', ...sortable('schoolName'),
      render: (t, r) => (
        <Button type="link" style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setDetailId(r.id)}>
          {t}
        </Button>
      ),
    },
    { title: 'Board', dataIndex: 'board', key: 'board', ...sortable('board'), render: (v) => v || '—' },
    { title: 'Students', dataIndex: 'studentStrength', key: 'studentStrength', ...sortable('studentStrength'), render: (v) => v ?? '—' },
    { title: 'TCV', dataIndex: 'totalContractValue', key: 'totalContractValue', align: 'right', ...sortable('totalContractValue'), render: (v) => inr(v) },
    { title: 'CAC', dataIndex: 'cac', key: 'cac', align: 'right', ...sortable('cac'), render: (v) => inr(v) },
    {
      title: 'Ageing', key: 'ageing', align: 'right', ...sortable('ageing'),
      render: (_, r) => {
        const d = ageingDays(r.leadDate);
        if (d === null) return '—';
        const aged = d >= ageingThresholdDays;
        return aged
          ? <Tag color="red" style={{ marginInlineEnd: 0 }}>{d}d</Tag>
          : `${d}d`;
      },
    },
    {
      title: 'Reminder', key: 'reminder', ...sortable('reminder'),
      render: (_, r) =>
        r.reminderAt ? (
          <Tag icon={<BellOutlined />} color={isReminderDue(r.reminderAt) ? 'red' : 'default'}>
            {dayjs(r.reminderAt).format('DD MMM')}
          </Tag>
        ) : '—',
    },
    { title: 'Region', dataIndex: 'region', key: 'region', ...sortable('region'), render: (v) => v || '—' },
    {
      title: 'Contact', key: 'contact', ...sortable('contact'),
      render: (_, r) => r.contactName ? `${r.contactName}${r.contactType ? ` (${CONTACT_LABEL[r.contactType]})` : ''}` : '—',
    },
    { title: 'Funnel', key: 'funnel', ...sortable('funnel'), render: (_, r) => r.funnel?.name || '—' },
    { title: 'Owner', key: 'owner', ...sortable('owner'), render: (_, r) => r.owner?.name || 'Unassigned' },
    {
      title: 'Stage', dataIndex: 'stage', key: 'stage', ...sortable('stage'),
      render: (s) => <Tag color={stageColor(s)}>{stageName(s)}</Tag>,
    },
    {
      key: 'actions', fixed: 'right',
      width: actionsCollapsed ? 70 : (canWrite ? 330 : 90),
      title: actionsCollapsed ? (
        <Tooltip title="Expand actions">
          <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setActionsCollapsed(false)} />
        </Tooltip>
      ) : (
        <span>
          Actions{' '}
          <Tooltip title="Collapse actions">
            <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setActionsCollapsed(true)} />
          </Tooltip>
        </span>
      ),
      render: (_, r) => (actionsCollapsed ? (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          dropdownRender={() => (
            <div style={{ background: token.colorBgElevated, padding: 10, borderRadius: 8, boxShadow: token.boxShadowSecondary }}>
              {renderActions(r, true)}
            </div>
          )}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      ) : renderActions(r, false)),
    },
  ];

  // Sales Reps may only see/toggle columns the admin granted them.
  const allowedToggleable = isRep ? TOGGLEABLE_COLS.filter((c) => repColumns.includes(c.key)) : TOGGLEABLE_COLS;
  const allowedKeys = allowedToggleable.map((c) => c.key);
  const effectiveVisible = isRep ? visibleCols.filter((k) => allowedKeys.includes(k)) : visibleCols;
  const shownColumns = columns.filter(
    (c) => c.key === 'seq' || c.key === 'schoolName' || c.key === 'actions' || effectiveVisible.includes(c.key)
  );

  const columnsPanel = (
    <div style={{ background: token.colorBgElevated, padding: 12, borderRadius: 8, boxShadow: token.boxShadowSecondary, minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <a onClick={() => setVisibleCols(allowedKeys)}>All</a>
        <a onClick={() => setVisibleCols([])}>None</a>
      </div>
      <Checkbox.Group
        value={effectiveVisible}
        onChange={setVisibleCols}
        options={allowedToggleable.map((c) => ({ label: c.label, value: c.key }))}
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      />
    </div>
  );

  // Funnel switcher + per-funnel status.
  const statsById = Object.fromEntries(funnelStats.map((s) => [s.id, s]));
  const accessibleIds = user?.funnelIds?.length ? user.funnelIds : null;
  const statFunnelIds = new Set(funnelStats.map((s) => s.id));
  const switcherFunnels = funnels.filter((f) =>
    accessibleIds ? accessibleIds.includes(f.id) : (isRep ? statFunnelIds.has(f.id) : true)
  );
  const aggregate = switcherFunnels.reduce((acc, f) => {
    const s = statsById[f.id];
    if (s) {
      acc.total += s.total;
      acc.totalTCV += s.totalTCV;
      Object.entries(s.byStage).forEach(([k, v]) => { acc.byStage[k] = (acc.byStage[k] || 0) + v; });
    }
    return acc;
  }, { total: 0, totalTCV: 0, byStage: {} });
  const selectedStats = filters.funnelId ? (statsById[filters.funnelId] || { total: 0, totalTCV: 0, byStage: {} }) : aggregate;
  const segOptions = [
    { label: <span>All funnels <span style={{ opacity: 0.55 }}>{aggregate.total}</span></span>, value: 'all' },
    ...switcherFunnels.map((f) => ({
      label: <span>{f.name} <span style={{ opacity: 0.55 }}>{statsById[f.id]?.total || 0}</span></span>,
      value: f.id,
    })),
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Leads Pool</Title>
        <Space wrap>
          <Dropdown trigger={['click']} placement="bottomRight" dropdownRender={() => columnsPanel}>
            <Button icon={<SettingOutlined />}>Columns</Button>
          </Dropdown>
          {canExportLeads && (
            <>
              <Button icon={<DownloadOutlined />} onClick={exportXlsx}>Export</Button>
              <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
            </>
          )}
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>Refresh</Button>
          {canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingLead(null); setFormOpen(true); }}>
              Add lead
            </Button>
          )}
        </Space>
      </Row>

      {!canWrite && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={user?.locked && !readOnly && !(repsReadOnly && isRep)
            ? 'Your account is in view-only mode (set by the administrator).'
            : repsReadOnly && isRep && !readOnly
              ? 'Sales reps are currently in view-only mode (set by the administrator).'
              : 'The system is currently in read-only mode (set by the administrator).'}
        />
      )}

      {switcherFunnels.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <Segmented
              value={filters.funnelId ?? 'all'}
              onChange={(v) => setF({ funnelId: v === 'all' ? undefined : v })}
              options={segOptions}
            />
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {orderedIds.map((id) => (
              <Tag key={id} color={stageColor(id)}>{stageName(id)}: {selectedStats.byStage[id] || 0}</Tag>
            ))}
            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
              {selectedStats.total} leads · {inr(selectedStats.totalTCV)} TCV
            </span>
          </div>
        </Card>
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={6}>
            <Input.Search
              allowClear placeholder="Search school / contact / location"
              onSearch={(v) => setF({ search: v })}
              onChange={(e) => !e.target.value && setF({ search: '' })}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select allowClear style={{ width: '100%' }} placeholder="Region" value={filters.region}
              onChange={(v) => setF({ region: v })}
              options={filterMeta.regions.map((r) => ({ value: r, label: r }))} />
          </Col>
          <Col xs={12} md={3}>
            <Select allowClear style={{ width: '100%' }} placeholder="Stage" value={filters.stage}
              onChange={(v) => setF({ stage: v })}
              options={orderedIds.map((id) => ({ value: id, label: stageName(id) }))} />
          </Col>
          <Col xs={12} md={4}>
            <Select allowClear style={{ width: '100%' }} placeholder="Board" value={filters.board}
              onChange={(v) => setF({ board: v })}
              options={filterMeta.boards.map((b) => ({ value: b, label: b }))} />
          </Col>
          {canManageData(user) && (
            <Col xs={12} md={3}>
              <Select allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} placeholder="Owner"
                value={filters.ownerId} onChange={(v) => setF({ ownerId: v })}
                options={users.map((u) => ({ value: u.id, label: u.name }))} />
            </Col>
          )}
          <Col xs={12} md={4}>
            <InputNumber style={{ width: '100%' }} placeholder="Min students" min={0}
              value={filters.minStrength} onChange={(v) => setF({ minStrength: v })} />
          </Col>
          <Col xs={12} md={4}>
            <InputNumber style={{ width: '100%' }} placeholder="Max students" min={0}
              value={filters.maxStrength} onChange={(v) => setF({ maxStrength: v })} />
          </Col>
          <Col xs={24} md={7}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD MMM YYYY"
              placeholder={['Lead date from', 'to']}
              value={[filters.leadDateFrom ? dayjs(filters.leadDateFrom) : null, filters.leadDateTo ? dayjs(filters.leadDateTo) : null]}
              onChange={(range) => setF({
                leadDateFrom: range && range[0] ? range[0].toISOString() : undefined,
                leadDateTo: range && range[1] ? range[1].toISOString() : undefined,
              })}
            />
          </Col>
          <Col xs={12} md={3}>
            <InputNumber style={{ width: '100%' }} placeholder="Age ≥ d" min={0}
              value={filters.minAge} onChange={(v) => setF({ minAge: v })} />
          </Col>
          <Col xs={12} md={3}>
            <InputNumber style={{ width: '100%' }} placeholder="Age ≤ d" min={0}
              value={filters.maxAge} onChange={(v) => setF({ maxAge: v })} />
          </Col>
          <Col xs={12} md={5}>
            <Checkbox
              checked={filters.reminderDue}
              onChange={(e) => setF({ reminderDue: e.target.checked })}
            >
              Reminders due
            </Checkbox>
          </Col>
          <Col xs={12} md={3}>
            <Button onClick={resetFilters} block>Clear</Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        loading={loading}
        columns={shownColumns}
        dataSource={data}
        scroll={{ x: 'max-content' }}
        showSorterTooltip={{ title: 'Sort' }}
        onChange={onTableChange}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true,
          showTotal: (t) => `${t} leads`,
        }}
      />

      <LeadFormModal
        open={formOpen}
        lead={editingLead}
        funnels={funnels}
        users={users}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
      />
      <LeadDetailDrawer
        leadId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onChanged={refreshAll}
        closureStage={CLOSURE_STAGE}
        onOpenPo={(l) => { setDetailId(null); setPoLead(l); }}
      />
      <PurchaseOrderModal
        lead={poLead}
        open={!!poLead}
        canWrite={canWrite}
        onClose={() => setPoLead(null)}
      />
    </div>
  );
}
