import { createHmac } from 'node:crypto';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CustomerOrdersService } from '@/modules/customer-orders/customer-orders.service';
import { PaymentsService } from '@/modules/payments/payments.service';
import { serializeVnpayParams } from '@/modules/integrations/vnpay/vnpay.service';
import { RealtimeGateway } from '@/modules/realtime/realtime.gateway';
import type { createNotificationEnvironment } from './notification-environment';

/** Test-only stdin actions; never registered as an application HTTP endpoint. */
export function notificationRuntimeActions(
  env: Awaited<ReturnType<typeof createNotificationEnvironment>>,
) {
  let orderId: string | undefined;
  let paymentOrderId: string | undefined;
  return async (line: string): Promise<boolean> => {
    if (line === 'cod') {
      const result = await env.place();
      orderId = result.orderId;
      console.log(`COD_COMMITTED:${result.orderCode}`);
      return true;
    }
    if (
      ['confirm', 'packing', 'shipping', 'complete'].includes(line) &&
      orderId
    ) {
      const statuses = {
        confirm: 'CONFIRMED',
        packing: 'PACKING',
        shipping: 'SHIPPING',
        complete: 'COMPLETED',
      } as const;
      const targetStatus = statuses[line as keyof typeof statuses];
      const actor = await env.principal(env.admin);
      actor.permissions = actor.branchAssignments.find(
        (assignment) => assignment.branchId === env.branches[0].id,
      )!.permissions;
      await env.app.get(AdminOrdersService).transition(
        actor,
        {
          scope: 'SELECTED',
          selectedBranchId: env.branches[0].id,
          allowedBranchIds: actor.allowedBranchIds,
        },
        orderId,
        { targetStatus },
      );
      console.log(`TRANSITION:${targetStatus}`);
      return true;
    }
    if (line === 'receipt' && orderId) {
      await env.app
        .get(CustomerOrdersService)
        .confirmReceived(await env.principal(), orderId);
      console.log('RECEIPT_CONFIRMED_STILL_SHIPPING');
      return true;
    }
    if (line === 'cancel-customer' && orderId) {
      await env.app
        .get(CustomerOrdersService)
        .cancel(await env.principal(), orderId);
      console.log('CUSTOMER_CANCELLED');
      return true;
    }
    if (line === 'vnpay-create') {
      const result = await env.place('VNPAY');
      paymentOrderId = result.orderId;
      console.log(`VNPAY_PENDING:${result.orderCode}`);
      return true;
    }
    if (line === 'vnpay-paid' && paymentOrderId) {
      const tx = await env.prisma.paymentTransaction.findFirstOrThrow({
        where: { payment: { orderId: paymentOrderId } },
      });
      const params = {
        vnp_TmnCode: env.config.getOrThrow<string>('payment.vnpay.tmnCode'),
        vnp_TxnRef: tx.merchantTxnRef,
        vnp_Amount: String(Number(tx.amount) * 100),
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      };
      const query = {
        ...params,
        vnp_SecureHash: createHmac(
          'sha512',
          env.config.getOrThrow<string>('payment.vnpay.hashSecret'),
        )
          .update(serializeVnpayParams(params))
          .digest('hex'),
      };
      await env.app.get(PaymentsService).handleVnpayIpn(query);
      await env.app.get(PaymentsService).handleVnpayIpn(query);
      console.log('VNPAY_VERIFIED_WITH_DUPLICATE');
      return true;
    }
    if (line === 'disconnect-sockets') {
      env.app.get(RealtimeGateway).onModuleDestroy();
      console.log('SOCKETS_DISCONNECTED_REST_AVAILABLE');
      return true;
    }
    return false;
  };
}
