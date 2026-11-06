import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Tag, Progress, Space, Button, List, Empty, Select } from 'antd';
import {
  SolutionOutlined, FunnelPlotOutlined, ImportOutlined, TeamOutlined, SettingOutlined,
  BellOutlined, ClockCircleOutlined, CheckCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth, canManageData } from '../auth';
import { useConfig } from '../config';
import { inr } from '../format';
import TargetsModal from '../components/TargetsModal';

const { Title, Text } = Typography;
const CLOSURE_STAGE = 'closure';

// Indian FY (Apr–Mar) label for a given start year, and the list around "now".
const fyLabel = (startYear) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
const fyStartYearNow = () => { const n = new Date(); return n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; };
const FY_OPTIONS = [fyStartYearNow() - 1, fyStartYearNow(), fyStartYearNow() + 1].map(fyLabel);

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { stages, orderedIds, stageName, stageColor, ageingThresholdDays } = useConfig();

  const [funnels, setFunnels] = useState([]);
  const [recent, setRecent] = useState([]);
  const [remindersDue, setRemindersDue] = useState(0);
  const [aged, setAged] = useState(0);
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [fy, setFy] = useState(fyLabel(fyStartYearNow()));
  const [analysis, setAnalysis] = useState(null);
  const [targetsOpen, setTargetsOpen] = useState(false);

  useEffect(() => {
    api.get('/leads/stats').then((r) => setFunnels(r.data.funnels)).catch(() => {});
    api.get('/leads', { params: { pageSize: 6 } }).then((r) => setRecent(r.data.data)).catch(() => {});
    api.get('/leads', { params: { reminderDue: true, pageSize: 1 } }).then((r) => setRemindersDue(r.data.total)).catch(() => {});
    api.get('/leads', { params: { minAge: ageingThresholdDays, pageSize: 1 } }).then((r) => setAged(r.data.total)).catch(() => {});
  }, [ageingThresholdDays]);

  const loadAnalysis = () => {
    if (!isAdmin) return;
    api.get('/targets/analysis', { params: { fy } }).then((r) => setAnalysis(r.data)).catch(() => {});
  };
  useEffect(loadAnalysis, [isAdmin, fy]);

  const pct = (a, t) => (t > 0 ? Math.round((a / t) * 100) : 0);
  const breakdown = (title, items) => (
    <Col xs={24} md={8}>
      <Card type="inner" size="small" title={title} styles={{ body: { maxHeight: 260, overflowY: 'auto' } }}>
        {(!items || !items.length) ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" /> : items.map((it) => (
          <div key={it.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{it.label}</span>
              <span>{inr(it.achieved)}{it.target ? <Text type="secondary"> / {inr(it.target)}</Text> : ''}</span>
            </div>
            <Progress percent={pct(it.achieved, it.target)} size="small" status={it.target && it.achieved >= it.target ? 'success' : 'active'} />
          </div>
        ))}
      </Card>
    </Col>
  );

  // Aggregate across the funnels the user can see.
  const agg = funnels.reduce((a, f) => {
    a.total += f.total;
    a.tcv += f.totalTCV;
    Object.entries(f.byStage).forEach(([k, v]) => { a.byStage[k] = (a.byStage[k] || 0) + v; });
    return a;
  }, { total: 0, tcv: 0, byStage: {} });
  const closed = agg.byStage[CLOSURE_STAGE] || 0;
  const maxStage = Math.max(1, ...orderedIds.map((id) => agg.byStage[id] || 0));

  const modules = [
    { key: '/leads', icon: <SolutionOutlined />, label: 'Leads Pool', show: true },
    { key: '/funnels', icon: <FunnelPlotOutlined />, label: 'Funnels', show: canManageData(user) },
    { key: '/import', icon: <ImportOutlined />, label: 'Import', show: canManageData(user) },
    { key: '/users', icon: <TeamOutlined />, label: 'Users', show: canManageData(user) },
    { key: '/config', icon: <SettingOutlined />, label: 'Configuration', show: user?.role === 'SUPER_ADMIN' },
  ].filter((m) => m.show);

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 12]} style={{ marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Welcome, {user?.name}</Title>
          <Text type="secondary">
            {user?.role === 'SUPER_ADMIN' ? 'Organisation-wide overview' : 'Your leads overview'}
          </Text>
        </div>
        <Button type="primary" icon={<SolutionOutlined />} onClick={() => navigate('/leads')}>Go to Leads Pool</Button>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Total leads" value={agg.total} prefix={<SolutionOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Pipeline value (TCV)" value={inr(agg.tcv)} prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Closed (won)" value={closed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Reminders due" value={remindersDue} prefix={<BellOutlined />} valueStyle={{ color: remindersDue ? '#cf1322' : undefined }} /></Card></Col>
      </Row>

      {isAdmin && analysis && (
        <Card
          size="small"
          style={{ marginTop: 16 }}
          title="Sales targets & achievement"
          extra={(
            <Space>
              <Select size="small" value={fy} onChange={setFy} options={FY_OPTIONS.map((f) => ({ value: f, label: `FY ${f}` }))} />
              <Button size="small" onClick={() => setTargetsOpen(true)}>Set targets</Button>
            </Space>
          )}
        >
          <Row align="middle" gutter={16} style={{ marginBottom: 12 }}>
            <Col flex="auto">
              <Text strong>Overall FY {fy}</Text>
              <div><Text type="secondary">{inr(analysis.overall.achieved)} achieved{analysis.overall.target ? ` of ${inr(analysis.overall.target)} target` : ' · no target set'}</Text></div>
            </Col>
            <Col xs={24} md={{ flex: '260px' }}>
              <Progress
                percent={pct(analysis.overall.achieved, analysis.overall.target)}
                status={analysis.overall.target && analysis.overall.achieved >= analysis.overall.target ? 'success' : 'active'}
              />
            </Col>
          </Row>
          <Row gutter={[12, 12]}>
            {breakdown('By Region / Territory', analysis.byRegion)}
            {breakdown('By Funnel', analysis.byFunnel)}
            {breakdown('By Sales Person', analysis.byUser)}
          </Row>
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="Leads by stage" size="small" extra={<a onClick={() => navigate('/leads')}>Open Leads Pool</a>}>
            {agg.total === 0 ? <Empty description="No leads yet" /> : orderedIds.map((id) => (
              <div key={id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span><Tag color={stageColor(id)}>{stageName(id)}</Tag></span>
                  <b>{agg.byStage[id] || 0}</b>
                </div>
                <Progress
                  percent={Math.round(((agg.byStage[id] || 0) / maxStage) * 100)}
                  showInfo={false}
                  strokeColor={stageColor(id)}
                  size="small"
                />
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="By funnel" size="small" extra={<Tag icon={<ClockCircleOutlined />} color={aged ? 'orange' : 'default'}>{aged} aged {ageingThresholdDays}d+</Tag>}>
            {funnels.length === 0 ? <Empty description="No funnels" /> : (
              <List
                size="small"
                dataSource={[...funnels].sort((a, b) => b.total - a.total)}
                renderItem={(f) => (
                  <List.Item actions={[<b key="t">{f.total}</b>]}>
                    <List.Item.Meta
                      title={f.name}
                      description={<Text type="secondary">{inr(f.totalTCV)} · {f.byStage[CLOSURE_STAGE] || 0} closed</Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="Recently updated leads" size="small">
            {recent.length === 0 ? <Empty description="No leads yet" /> : (
              <List
                size="small"
                dataSource={recent}
                renderItem={(l) => (
                  <List.Item actions={[<Tag key="s" color={stageColor(l.stage)}>{stageName(l.stage)}</Tag>]}>
                    <List.Item.Meta
                      title={<a onClick={() => navigate('/leads')}>{l.schoolName}</a>}
                      description={<Text type="secondary">{l.funnel?.name || '—'} · {l.owner?.name || 'Unassigned'}</Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Modules" size="small">
            <Space wrap>
              {modules.map((m) => (
                <Button key={m.key} icon={m.icon} onClick={() => navigate(m.key)}>{m.label}</Button>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <TargetsModal fy={fy} open={targetsOpen} onClose={() => setTargetsOpen(false)} onSaved={loadAnalysis} />
    </div>
  );
}
