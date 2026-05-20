import { IsEnum, IsNumber, IsOptional, IsBoolean, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionCategory } from '../../transactions/entities/transaction.entity';
import { BudgetPeriod } from '../entities/budget.entity';

export class CreateBudgetDto {
  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID()
  id?: string;
  @ApiProperty({
    enum: TransactionCategory,
    example: TransactionCategory.FOOD,
  })
  @IsEnum(TransactionCategory)
  category!: TransactionCategory;

  @ApiProperty({ example: 400.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'La limite doit être supérieure à 0' })
  limitAmount!: number;

  @ApiPropertyOptional({
    enum: BudgetPeriod,
    default: BudgetPeriod.MONTHLY,
  })
  @IsOptional()
  @IsEnum(BudgetPeriod)
  period?: BudgetPeriod;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
