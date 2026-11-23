import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Tag, Space, Button, List, Empty, Select, theme } from 'antd';
import {
  SolutionOutlined, FunnelPlotOutlined, ImportOutlined, TeamOutlined, SettingOutlined,
  BellOutlined, CheckCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth, canManageData } from '../auth';
import { useConfig } from '../config';
import { inr } from '../format';
import TargetsModal from '../components/TargetsModal';
import { DonutChart, MeterList } from '../components/AnalysisCharts';

const { Title, Text } = Typography;

const fyLabel = (startYear) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
const fyStartYearNow = () => { const n = new Date(); return n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; };
const FY_OPTIONS = [fyStartYearNow() - 1, fyStartYearNow(), fyStartYearNow() + 1].map(fyLabel);

const SCOPE_LINE = {
  organisation: 'Organisation-wide overview',
  region: 'Your region',
  funnels: 'Funnels assigned to you',
  own: 'Your own leads',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { orderedIds, stageName, stageColor, ageingThresholdDays } = useConfig();

  const [recent, setRecent] = useState([]);
  const [remindersDue, setRemindersDue] = useState(0);
  const [aged, setAged] = useState(0);
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [fy, setFy] = useState(fyLabel(fyStartYearNow()));
  const [analysis, setAnalysis] = useState(null);
  const [targetsOpen, setTargetsOpen] = useState(false);

  useEffect(() => {
    api.get('/leads', { params: { pageSize: 6 } }).then((r) => setRecent(r.data.data)).catch(() => {});
    api.get('/leads', { params: { reminderDue: true, pageSize: 1 } }).then((r) => setRemindersDue(r.data.total)).catch(() => {});
    api.get('/leads', { params: { minAge: ageingThresholdDays, pageSize: 1 } }).then((r) => setAged(r.data.total)).catch(() => {});
  }, [ageingThresholdDays]);

  const loadAnalysis = () => {
    api.get('/targets/analysis', { params: { fy } }).then((r) => setAnalysis(r.data)).catch(() => {});
  };
  useEffect(loadAnalysis, [fy]);

  const pct = (a, t) => (t > 0 ? Math.min(100, Math.round((a / t) * 100)) : 0);
  const overall = analysis?.overall || { target: 0, achieved: 0, closedCount: 0, pipelineCount: 0, pipelineValue: 0 };
  const stageRows = (analysis?.byStage || []).map((s) => ({
    ...s,
    label: stageName(s.key),
    color: stageColor(s.key),
  }));
  const stageSlices = stageRows
    .filter((s) => s.count > 0)
    .map((s) => ({ label: s.label, value: s.count, color: s.color, display: String(s.count) }));
  const remaining = Math.max(0, overall.target - overall.achieved);
  const closureSlices = overall.target > 0
    ? [
      { label: 'Closed revenue', value: overall.achieved, color: token.colorPrimary, display: inr(overall.achieved) },
      { label: 'Left to target', value: remaining, color: token.colorFillSecondary, display: inr(remaining) },
    ]
    : [{ label: 'Closed revenue', value: overall.achieved, color: token.colorPrimary, display: inr(overall.achieved) }];

  const moneyRows = (items) => (items || []).map((it) => ({
    key: it.key,
    label: it.label,
    value: it.achieved,
    target: it.target,
    color: token.colorPrimary,
    display: it.target ? `${inr(it.achieved)} / ${inr(it.target)}` : inr(it.achieved),
    hint: `${it.leads || 0} lead${it.leads === 1 ? '' : 's'} · ${it.closedCount || 0} closed`,
  }));

  const scopeLine = analysis?.scope === 'region' && user?.region
    ? `${user.region} overview`
    : (SCOPE_LINE[analysis?.scope] || 'Your leads overview');

  const modules = [
    { key: '/leads', icon: <SolutionOutlined />, label: 'Leads Pool', show: true },
    { key: '/funnels', icon: <FunnelPlotOutlined />, label: 'Funnels', show: canManageData(user) },
    { key: '/import', icon: <ImportOutlined />, label: 'Import', show: canManageData(user) },
    { key: '/users', icon: <TeamOutlined />, label: 'Users', show: canManageData(user) },
    { key: '/config', icon: <SettingOutlined />, label: 'Configuration', show: isAdmin },
  ].filter((m) => m.show);

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 12]} style={{ marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Welcome, {user?.name}</Title>
          <Text type="secondary">{scopeLine}</Text>
        </div>
        <Button type="primary" icon={<SolutionOutlined />} onClick={() => navigate('/leads')}>Go to Leads Pool</Button>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Total leads" value={overall.pipelineCount} prefix={<SolutionOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Pipeline value" value={inr(overall.pipelineValue)} prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title={`Closures in FY ${fy}`} value={overall.closedCount} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small"><Statistic title="Reminders due" value={remindersDue} prefix={<BellOutlined />} valueStyle={{ color: remindersDue ? '#cf1322' : undefined }} /></Card></Col>
      </Row>

      <Card
        size="small"
        style={{ marginTop: 16 }}
        title={`FY ${fy} analysis`}
        extra={(
          <Space>
            <Select size="small" value={fy} onChange={setFy} options={FY_OPTIONS.map((f) => ({ value: f, label: `FY ${f}` }))} />
            {isAdmin && <Button size="small" onClick={() => setTargetsOpen(true)}>Set targets</Button>}
          </Space>
        )}
      >
        <Text type="secondary">
          Closed revenue is the contract value of leads that entered Closure in this financial year.
          {aged ? ` ${aged} open leads are older than ${ageingThresholdDays} days.` : ''}
        </Text>
        <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
          <Col xs={24} md={12}>
            <Card type="inner" size="small" title="Closures against target">
              <DonutChart
                slices={closureSlices}
                center={overall.target > 0 ? `${pct(overall.achieved, overall.target)}%` : String(overall.closedCount)}
                caption={overall.target > 0 ? 'of target' : 'closures'}
              />
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  {inr(overall.achieved)} closed
                  {overall.target ? ` of ${inr(overall.target)} target` : ' · no target set'}
                </Text>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card type="inner" size="small" title="Pipeline by stage">
              <DonutChart
                slices={stageSlices}
                center={String(overall.pipelineCount)}
                caption="leads"
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card type="inner" size="small" title="Value in each stage">
              <MeterList
                items={stageRows.filter((s) => orderedIds.includes(s.key) || s.count > 0).map((s) => ({
                  key: s.key,
                  label: s.label,
                  value: s.tcv,
                  color: s.color,
                  display: inr(s.tcv),
                  hint: `${s.count} lead${s.count === 1 ? '' : 's'}`,
                }))}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card type="inner" size="small" title="Closed revenue by funnel">
              <MeterList items={moneyRows(analysis?.byFunnel)} empty="No funnel activity" />
            </Card>
          </Col>
          <Col xs={24} md={isAdmin ? 12 : 24}>
            <Card type="inner" size="small" title="Closed revenue by region">
              <MeterList items={moneyRows(analysis?.byRegion)} empty="No region activity" />
            </Card>
          </Col>
          {isAdmin && (
            <Col xs={24} md={12}>
              <Card type="inner" size="small" title="Closed revenue by sales person">
                <MeterList items={moneyRows(analysis?.byUser)} empty="No sales-person closures" />
              </Card>
            </Col>
          )}
        </Row>
      </Card>

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
                      description={<Text type="secondary">{l.funnel?.name || '—'} · {l.owner?.name || 'Unassigned'}{l.region ? ` · ${l.region}` : ''}</Text>}
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
