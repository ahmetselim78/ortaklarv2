export const PASSWORD_POLICY_MESSAGE = 'Parola en az 6 karakter olmalı; küçük harf, büyük harf, rakam ve özel karakter içermelidir.'

const specialCharacter = /[!@#$%^&*()_+\-=[\]{};'":|<>?,./`~\\]/

export function isValidPassword(password: string) {
  return password.length >= 6
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && specialCharacter.test(password)
}
