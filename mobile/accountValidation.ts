// Keep these limits aligned with server/src/accountStore.ts and accountRoutes.ts.
export const USERNAME_RULE = '3～24 位，以英文字母开头；仅限字母、数字和下划线。大写字母会转为小写。';
export const DISPLAY_NAME_RULE = '去掉首尾空格后为 1～40 个字符，不能包含换行等控制字符。';
export const PASSWORD_RULE = '10～128 个字符；中文或表情较多时，还需不超过 256 字节。';
export const INVITATION_RULE = '完整粘贴 43 位邀请码；仅能使用一次，7 天内有效。';
export const RESET_TOKEN_RULE = '完整粘贴 43 位重置凭据；生成后 30 分钟内有效。';

function utf8Bytes(value: string) {
  let length = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
}

export const usernameError = (value: string) => /^[a-z][a-z0-9_]{2,23}$/.test(value.trim().toLowerCase()) ? '' : USERNAME_RULE;
export const displayNameError = (value: string) => {
  const length = value.trim().length;
  return length >= 1 && length <= 40 && !/[\u0000-\u001f]/.test(value) ? '' : DISPLAY_NAME_RULE;
};
export const newPasswordError = (value: string) => value.length >= 10 && value.length <= 128 && utf8Bytes(value) <= 256 ? '' : PASSWORD_RULE;
export const invitationError = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value.trim()) ? '' : INVITATION_RULE;
export const resetTokenError = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value.trim()) ? '' : RESET_TOKEN_RULE;
