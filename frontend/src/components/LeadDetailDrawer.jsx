import { useEffect, useState } from 'react';
import { Drawer, Descriptions, Tag, Timeline, Divider, Button, Select, Input, Space, App, Typography } from 'antd';
import dayjs from 'dayjs';
import api from '../api';
import { inr, ageingDays, isReminderDue } from '../format';
import { useAuth, canManageData } from '../auth';
import { useConfig } from '../config';

const { Text } = Typography;
const CONTACT_LABEL = { INFLUENCER: 'Influencer', PROMOTER: 'School Promoter' };

// Shows full lead detail plus the stage-change history, and lets the user
// move the lead to another stage (recorded with a note).
export default function LeadDetailDrawer({ leadId, open, onClose, onChanged, closureStage, onOpenPo }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { stageName, stageColor, orderedIds, stageIndex, nextStageId, readOnly, repsReadOnly, ageingThresholdDays } = useConfig();
  const isRep = user?.role === 'SALES_REP';
  const canWrite = user?.role === 'SUPER_ADMIN' || (!readOnly && !(repsReadOnly && isRep) && !user?.locked);
  // Closed leads are stage-locked for everyone but Super Admin.
  const stageLocked = (s) => s === closureStage && user?.role !== 'SUPER_ADMIN';
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toStage, setToStage] = useState(null);
  const [note, setNote] = useState('');

  const load = () => {
    if (!leadId) return;
    setLoading(true);
    api
      .get(`/leads/${leadId}`)
      .then((r) => {
        setLead(r.data.lead);
        setToStage(null);
        setNote('');
      })
      .catch((e) => message.error(e.response?.data?.error || 'Could not load lead'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && leadId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  const changeStage = async () => {
    if (!toStage) return message.warning('Pick a stage to move to');
    try {
      await api.post(`/leads/${lead.id}/stage`, { toStage, note });
      message.success(`Moved to ${stageName(toStage)}`);
      load();
      onChanged && onChanged();
      if (toStage === closureStage && onOpenPo) onOpenPo(lead);
    } catch (e) {
      message.error(e.response?.data?.error || 'Stage change failed');
    }
  };

  const promote = async () => {
    const to = nextStageId(lead.stage);
    try {
      await api.post(`/leads/${lead.id}/promote`, { note });
      message.success('Promoted to next stage');
      load();
      onChanged && onChanged();
      if (to === closureStage && onOpenPo) onOpenPo(lead);
    } catch (e) {
      message.error(e.response?.data?.error || 'Promote failed');
    }
  };

  return (
    <Drawer open={open} onClose={onClose} width={520} loading={loading} title={lead ? lead.schoolName : 'Lead'}>
      {lead && (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Stage">
              <Tag color={stageColor(lead.stage)}>{stageName(lead.stage)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Board">{lead.board || '—'}</Descriptions.Item>
            <Descriptions.Item label="Student strength">{lead.studentStrength ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Total Contract Value">{inr(lead.totalContractValue)}</Descriptions.Item>
            <Descriptions.Item label="PSPM Rate">{inr(lead.pspmRate)}</Descriptions.Item>
            <Descriptions.Item label="CAC">{inr(lead.cac)}</Descriptions.Item>
            <Descriptions.Item label="Lead date">
              {lead.leadDate ? (
                <>
                  {dayjs(lead.leadDate).format('DD MMM YYYY')}{' '}
                  {(() => {
                    const d = ageingDays(lead.leadDate);
                    return d >= ageingThresholdDays
                      ? <Tag color="red" style={{ marginInlineEnd: 0 }}>{d}d old</Tag>
                      : <Text type="secondary">({d}d old)</Text>;
                  })()}
                </>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Reminder">
              {lead.reminderAt ? (
                <>
                  <Tag color={isReminderDue(lead.reminderAt) ? 'red' : 'default'}>{dayjs(lead.reminderAt).format('DD MMM YYYY')}</Tag>
                  {lead.reminderNote ? ` ${lead.reminderNote}` : ''}
                </>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Region">{lead.region || '—'}</Descriptions.Item>
            <Descriptions.Item label="Location">{lead.location || '—'}</Descriptions.Item>
            <Descriptions.Item label="Contact">
              {lead.contactName || '—'}
              {lead.contactType ? ` (${CONTACT_LABEL[lead.contactType]})` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Phone">{lead.contactPhone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Funnel">{lead.funnel?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Owner">{lead.owner?.name || 'Unassigned'}</Descriptions.Item>
            <Descriptions.Item label="Source">{lead.source || '—'}</Descriptions.Item>
          </Descriptions>

          {lead.stage === closureStage && onOpenPo && (
            <Button type="primary" block style={{ marginTop: 16 }} onClick={() => onOpenPo(lead)}>
              Purchase Order
            </Button>
          )}

          {canWrite && !stageLocked(lead.stage) && (
            <>
              <Divider>Move stage</Divider>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    style={{ width: 160 }}
                    placeholder="Move to…"
                    value={toStage}
                    onChange={setToStage}
                    options={orderedIds
                      .filter((id) => {
                        if (id === lead.stage) return false;
                        // Reps can only move forward; admins/managers can also send back.
                        if (canManageData(user)) return true;
                        return stageIndex(id) > stageIndex(lead.stage);
                      })
                      .map((id) => ({ value: id, label: stageName(id) }))}
                  />
                  <Button type="default" onClick={changeStage}>Move</Button>
                  <Button type="primary" onClick={promote} disabled={!nextStageId(lead.stage)}>
                    Promote to next
                  </Button>
                </Space.Compact>
                <Input.TextArea
                  rows={2}
                  placeholder="Optional note for this stage change"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Space>
            </>
          )}

          <Divider>History</Divider>
          <Timeline
            items={(lead.history || []).map((h) => ({
              color: stageColor(h.toStage),
              children: (
                <div>
                  <Text strong>{h.fromStage ? `${stageName(h.fromStage)} → ${stageName(h.toStage)}` : stageName(h.toStage)}</Text>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {new Date(h.changedAt).toLocaleString()} · {h.changedBy?.name || 'System'}
                  </div>
                  {h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
                </div>
              ),
            }))}
          />
        </>
      )}
    </Drawer>
  );
}
