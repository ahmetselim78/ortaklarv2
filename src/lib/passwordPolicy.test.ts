import { describe, expect, it } from 'vitest'
import { isValidPassword } from './passwordPolicy'

describe('isValidPassword', () => {
  it('accepts a six-character password with every required character class', () => {
    expect(isValidPassword('Abc1!x')).toBe(true)
  })

  it.each(['Ab1!x', 'abc1!x', 'ABC1!X', 'Abc!xy', 'Abc1xy'])('rejects incomplete passwords', password => {
    expect(isValidPassword(password)).toBe(false)
  })
})
