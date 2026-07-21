export function deadlineUrgencyText(label: string, urgent: boolean): string {
  if (!urgent) {
    return '';
  }
  const match = /^(\d+):(\d{2})$/.exec(label);
  if (!match) {
    return '';
  }
  const totalSeconds = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isFinite(totalSeconds) || totalSeconds > 10) {
    return '';
  }
  return `${totalSeconds} ${totalSeconds === 1 ? 'second' : 'seconds'} left`;
}

export interface UrgentDeadlineAnnouncement {
  announcedKey: string;
  text: string;
}

export function nextUrgentDeadlineAnnouncement(
  roomCode: string,
  turnToken: number,
  label: string,
  urgent: boolean,
  announcedKey: string
): UrgentDeadlineAnnouncement {
  const key = roomCode ? `${roomCode}:${turnToken}` : '';
  if (!key || !urgent || key === announcedKey) {
    return { announcedKey, text: '' };
  }
  const text = deadlineUrgencyText(label, true);
  return text ? { announcedKey: key, text } : { announcedKey, text: '' };
}
