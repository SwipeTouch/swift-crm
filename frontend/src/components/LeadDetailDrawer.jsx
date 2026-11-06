import { useEffect, useRef, useState } from 'react';
import { Drawer, Descriptions, Tag, Timeline, Divider, Button, Select, Input, Space, App, Typography, Collapse, Image, Popconfirm, theme } from 'antd';
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
  const { token } = theme.useToken();
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
  const [remark, setRemark] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState({});
  const imageUrlsRef = useRef([]);
  const fileRef = useRef(null);

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

  const imageKey = (lead?.images || []).map((img) => img.id).join(',');
  useEffect(() => {
    if (!photosOpen || !lead?.id) return undefined;
    let cancelled = false;
    const created = [];
    (async () => {
      const next = {};
      for (const img of lead.images || []) {
        try {
          const r = await api.get(`/leads/${lead.id}/images/${img.id}`, { responseType: 'blob' });
          const url = URL.createObjectURL(r.data);
          created.push(url);
          next[img.id] = url;
        } catch {
          /* leave a blank tile if this one fails */
        }
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      imageUrlsRef.current = created;
      setImageUrls(next);
    })();
    return () => {
      cancelled = true;
    };
    // imageKey tracks the attachment list without refetching on unrelated lead edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosOpen, lead?.id, imageKey]);

  useEffect(() => () => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

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

  const attachImage = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !lead) return;
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await api.post(`/leads/${lead.id}/images`, body);
      setLead((prev) => (prev ? { ...prev, images: [r.data.image, ...(prev.images || [])] } : prev));
      setPhotosOpen(true);
      message.success('Image attached');
    } catch (e) {
      message.error(e.response?.data?.error || 'Could not attach the image');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async (imageId) => {
    try {
      await api.delete(`/leads/${lead.id}/images/${imageId}`);
      setLead((prev) => (prev ? { ...prev, images: (prev.images || []).filter((img) => img.id !== imageId) } : prev));
      message.success('Image removed');
    } catch (e) {
      message.error(e.response?.data?.error || 'Could not remove the image');
    }
  };

  const addNote = async () => {
    const body = remark.trim();
    if (!body) return message.warning('Write a note before saving');
    setSavingNote(true);
    try {
      const r = await api.post(`/leads/${lead.id}/notes`, { body });
      setLead((prev) => (prev ? { ...prev, notes: [...(prev.notes || []), r.data.note] } : prev));
      setRemark('');
      message.success('Note added');
    } catch (e) {
      message.error(e.response?.data?.error || 'Could not save the note');
    } finally {
      setSavingNote(false);
    }
  };

  const notesByDay = [];
  for (const n of lead?.notes || []) {
    const key = dayjs(n.createdAt).format('YYYY-MM-DD');
    const last = notesByDay[notesByDay.length - 1];
    if (!last || last.key !== key) {
      notesByDay.push({ key, label: dayjs(n.createdAt).format('DD MMM YYYY'), items: [n] });
    } else {
      last.items.push(n);
    }
  }
  notesByDay.reverse();

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

          <Collapse
            style={{ marginTop: 16 }}
            onChange={(keys) => {
              const list = Array.isArray(keys) ? keys : [keys];
              setPhotosOpen(list.includes('photos'));
            }}
            items={[{
              key: 'notes',
              label: `Notes & remarks${lead.notes?.length ? ` (${lead.notes.length})` : ''}`,
              children: (
                <div>
                  {notesByDay.length === 0 && (
                    <Text type="secondary">Nothing logged yet.</Text>
                  )}
                  {notesByDay.map((day) => (
                    <div key={day.key} style={{ marginBottom: 14 }}>
                      <Text strong>{day.label}</Text>
                      {day.items.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            marginTop: 8,
                            paddingLeft: 10,
                            borderLeft: `2px solid ${token.colorBorderSecondary}`,
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(n.createdAt).format('h:mm A')} · {n.author?.name || 'Someone'}
                          </Text>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {canWrite && (
                    <Space direction="vertical" style={{ width: '100%', marginTop: notesByDay.length ? 4 : 12 }}>
                      <Input.TextArea
                        rows={3}
                        value={remark}
                        maxLength={4000}
                        placeholder="What happened today? A call, a visit, what they asked for."
                        onChange={(e) => setRemark(e.target.value)}
                      />
                      <Button type="primary" size="small" loading={savingNote} onClick={addNote}>
                        Add note
                      </Button>
                    </Space>
                  )}
                </div>
              ),
            }, {
              key: 'photos',
              label: `Photos${lead.images?.length ? ` (${lead.images.length})` : ''}`,
              children: (
                <div>
                  {(lead.images || []).length === 0 && (
                    <Text type="secondary">No photos yet.</Text>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {(lead.images || []).map((img) => (
                      <div key={img.id} style={{ width: 104 }}>
                        {imageUrls[img.id] ? (
                          <Image
                            src={imageUrls[img.id]}
                            alt={img.filename || 'Lead photo'}
                            width={104}
                            height={104}
                            style={{ objectFit: 'cover', borderRadius: 6 }}
                          />
                        ) : (
                          <div style={{ width: 104, height: 104, borderRadius: 6, background: token.colorFillTertiary }} />
                        )}
                        <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                          {dayjs(img.createdAt).format('DD MMM')} · {img.author?.name || 'Someone'}
                        </Text>
                        {canWrite && (
                          <Popconfirm title="Remove this photo?" onConfirm={() => removeImage(img.id)} okText="Remove" okButtonProps={{ danger: true }}>
                            <Button type="link" size="small" danger style={{ padding: 0, height: 'auto' }}>Remove</Button>
                          </Popconfirm>
                        )}
                      </div>
                    ))}
                  </div>
                  {canWrite && (
                    <div style={{ marginTop: (lead.images || []).length ? 12 : 8 }}>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={attachImage}
                      />
                      <Button size="small" loading={uploadingImage} onClick={() => fileRef.current && fileRef.current.click()}>
                        Attach image
                      </Button>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          JPEG, PNG, WEBP, or GIF, up to 8 MB. Up to 8 photos.
                        </Text>
                      </div>
                    </div>
                  )}
                </div>
              ),
            }]}
          />

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
