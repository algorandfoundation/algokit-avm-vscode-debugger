import { arc4 } from '@algorandfoundation/algorand-typescript'

export class HelloWorldContract extends arc4.Contract {
  @arc4.abimethod()
  sayHello(name: string): string {
    return `Hello ${name}`
  }

  @arc4.baremethod({ onCreate: 'require' })
  create() {}
}
